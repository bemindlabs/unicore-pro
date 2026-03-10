/**
 * CloudflareSslClient — thin wrapper around the Cloudflare SSL/TLS REST API.
 *
 * Cloudflare API docs:
 *   https://developers.cloudflare.com/api/operations/zone-settings-change-ssl-setting
 *   https://developers.cloudflare.com/api/operations/certificate-packs-list-certificate-packs
 *   https://developers.cloudflare.com/api/operations/custom-hostname-for-a-zone-create-custom-hostname
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type { SslMode, CloudflareSslDetails } from '../types/ssl.types.js';
import { CLOUDFLARE_API_BASE, SSL_MODULE_OPTIONS } from '../ssl.constants.js';
import type { SslModuleOptions } from '../types/ssl.types.js';

// ---------------------------------------------------------------------------
// Cloudflare API response shapes
// ---------------------------------------------------------------------------

interface CfApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

interface CfSslSetting {
  id: string;
  value: string;
  modified_on: string;
}

export interface CfCertPackCertificate {
  id: string;
  type: string;
  hosts: string[];
  issuer: string;
  signature: string;
  status: string;
  bundle_method: string;
  validity_days: number;
  uploaded_on: string;
  modified_on: string;
  expires_on: string;
}

export interface CfCertPack {
  id: string;
  type: string;
  hosts: string[];
  status: string;
  primary_certificate: string;
  certificates: CfCertPackCertificate[];
}

interface CfCustomHostname {
  id: string;
  hostname: string;
  ssl: {
    id: string;
    type: string;
    method: string;
    status: string;
    settings: Record<string, unknown>;
  };
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

@Injectable()
export class CloudflareSslClient {
  private readonly logger = new Logger(CloudflareSslClient.name);
  private readonly baseUrl = CLOUDFLARE_API_BASE;

  constructor(
    @Inject(SSL_MODULE_OPTIONS) private readonly options: SslModuleOptions,
  ) {}

  // ---------------------------------------------------------------------------
  // SSL/TLS mode
  // ---------------------------------------------------------------------------

  /**
   * Updates the SSL/TLS mode for a Cloudflare zone.
   *
   * @see https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
   */
  async setSslMode(zoneId: string, mode: SslMode): Promise<void> {
    const url = `${this.baseUrl}/zones/${zoneId}/settings/ssl`;
    const body = JSON.stringify({ value: mode });

    this.logger.debug(`Setting SSL mode="${mode}" for zone=${zoneId}`);

    const response = await this.patch<CfSslSetting>(url, body);

    if (!response.success) {
      const errs = response.errors.map((e) => e.message).join('; ');
      throw new Error(`Cloudflare setSslMode failed: ${errs}`);
    }

    this.logger.log(`SSL mode set to "${mode}" for zone ${zoneId}`);
  }

  /**
   * Retrieves the current SSL/TLS mode for a Cloudflare zone.
   */
  async getSslMode(zoneId: string): Promise<SslMode> {
    const url = `${this.baseUrl}/zones/${zoneId}/settings/ssl`;
    const response = await this.get<CfSslSetting>(url);

    if (!response.success) {
      const errs = response.errors.map((e) => e.message).join('; ');
      throw new Error(`Cloudflare getSslMode failed: ${errs}`);
    }

    return response.result.value as SslMode;
  }

  // ---------------------------------------------------------------------------
  // Certificate packs (Universal SSL / ACM)
  // ---------------------------------------------------------------------------

  /**
   * Lists all certificate packs for a zone.
   */
  async listCertificatePacks(zoneId: string): Promise<CfCertPack[]> {
    const url = `${this.baseUrl}/zones/${zoneId}/ssl/certificate_packs?status=all`;
    const response = await this.get<CfCertPack[]>(url);

    if (!response.success) {
      const errs = response.errors.map((e) => e.message).join('; ');
      throw new Error(`Cloudflare listCertificatePacks failed: ${errs}`);
    }

    return response.result ?? [];
  }

  /**
   * Orders an Advanced Certificate Manager (ACM) certificate pack.
   * Returns null if ACM is not available on the current plan.
   */
  async orderAdvancedCertPack(
    zoneId: string,
    hostname: string,
  ): Promise<{ id: string; status: string } | null> {
    const url = `${this.baseUrl}/zones/${zoneId}/ssl/certificate_packs/order`;
    const body = JSON.stringify({
      type: 'advanced',
      hosts: [hostname, `*.${hostname}`],
      validation_method: 'txt',
      validity_days: 365,
      certificate_authority: 'lets_encrypt',
      cloudflareBranding: false,
    });

    try {
      const response = await this.post<{ id: string; status: string }>(url, body);
      if (!response.success) {
        this.logger.warn(
          `ACM order failed for zone=${zoneId} hostname=${hostname}: ` +
            response.errors.map((e) => e.message).join('; '),
        );
        return null;
      }
      this.logger.log(`ACM cert pack ordered: id=${response.result.id}`);
      return response.result;
    } catch (err: unknown) {
      this.logger.warn(
        `ACM unavailable for zone=${zoneId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves a specific certificate pack by ID.
   */
  async getCertificatePack(
    zoneId: string,
    certPackId: string,
  ): Promise<CfCertPack | null> {
    const url = `${this.baseUrl}/zones/${zoneId}/ssl/certificate_packs/${certPackId}`;
    const response = await this.get<CfCertPack>(url);

    if (!response.success) return null;
    return response.result;
  }

  // ---------------------------------------------------------------------------
  // Custom Hostnames (multi-tenant / Cloudflare for SaaS)
  // ---------------------------------------------------------------------------

  /**
   * Creates a custom hostname SSL entry for multi-tenant domain provisioning.
   * Requires Cloudflare for SaaS (Enterprise plan).
   * Returns null if the feature is unavailable.
   */
  async createCustomHostname(
    zoneId: string,
    hostname: string,
  ): Promise<{ id: string; status: string } | null> {
    const url = `${this.baseUrl}/zones/${zoneId}/custom_hostnames`;
    const body = JSON.stringify({
      hostname,
      ssl: {
        method: 'txt',
        type: 'dv',
        settings: {
          http2: 'on',
          tls_1_3: 'on',
          min_tls_version: '1.2',
        },
      },
    });

    try {
      const response = await this.post<CfCustomHostname>(url, body);
      if (!response.success) {
        this.logger.warn(
          `Custom hostname creation failed for ${hostname}: ` +
            response.errors.map((e) => e.message).join('; '),
        );
        return null;
      }
      return { id: response.result.id, status: response.result.status };
    } catch (err: unknown) {
      this.logger.warn(
        `Custom hostname creation error: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Gets the status of a custom hostname SSL entry.
   */
  async getCustomHostname(
    zoneId: string,
    hostnameId: string,
  ): Promise<CfCustomHostname | null> {
    const url = `${this.baseUrl}/zones/${zoneId}/custom_hostnames/${hostnameId}`;
    const response = await this.get<CfCustomHostname>(url);

    if (!response.success) return null;
    return response.result;
  }

  /**
   * Deletes a custom hostname SSL entry.
   */
  async deleteCustomHostname(zoneId: string, hostnameId: string): Promise<void> {
    const url = `${this.baseUrl}/zones/${zoneId}/custom_hostnames/${hostnameId}`;
    await this.delete(url);
    this.logger.log(`Custom hostname ${hostnameId} deleted from zone ${zoneId}`);
  }

  // ---------------------------------------------------------------------------
  // SSL details aggregation
  // ---------------------------------------------------------------------------

  /**
   * Returns a consolidated CloudflareSslDetails object for a zone.
   * Optionally focuses on a specific certificate pack.
   */
  async getSslDetails(
    zoneId: string,
    certPackId?: string | null,
  ): Promise<CloudflareSslDetails> {
    const packs = await this.listCertificatePacks(zoneId);

    const pack = certPackId
      ? (packs.find((p) => p.id === certPackId) ?? packs[0])
      : packs[0];

    if (!pack) {
      return {};
    }

    const primary = pack.certificates.find(
      (c) => c.id === pack.primary_certificate,
    );

    return {
      certPackId: pack.id,
      type: pack.type,
      hosts: pack.hosts,
      ...(primary
        ? {
            primaryCertificate: {
              id: primary.id,
              type: primary.type,
              hosts: primary.hosts,
              issuer: primary.issuer,
              signature: primary.signature,
              status: primary.status,
              bundleMethod: primary.bundle_method,
              validFrom: primary.uploaded_on,
              validTo: primary.expires_on,
            },
          }
        : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.cloudflareApiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async get<T>(url: string): Promise<CfApiResponse<T>> {
    const res = await fetch(url, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    return res.json() as Promise<CfApiResponse<T>>;
  }

  private async post<T>(url: string, body: string): Promise<CfApiResponse<T>> {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body,
    });
    return res.json() as Promise<CfApiResponse<T>>;
  }

  private async patch<T>(url: string, body: string): Promise<CfApiResponse<T>> {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.authHeaders(),
      body,
    });
    return res.json() as Promise<CfApiResponse<T>>;
  }

  private async delete(url: string): Promise<void> {
    await fetch(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
  }
}
