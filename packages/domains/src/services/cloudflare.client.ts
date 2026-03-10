/**
 * CloudflareClient — HTTP client for the Cloudflare API v4.
 *
 * Responsibilities:
 *  - Zone lookup by domain name (apex resolution for subdomains).
 *  - Create / update / delete DNS records (A, CNAME, TXT).
 *  - Fetch current DNS record status.
 *
 * All network calls use the native `fetch` (Node 18+) and honour the
 * `CloudflareConfig.apiToken` for Bearer authentication.
 */

import { Injectable, Logger, Inject, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type {
  CloudflareConfig,
  CloudflareZone,
  CloudflareDnsRecord,
  CreateDnsRecordInput,
  UpdateDnsRecordInput,
} from '../types/domains.types.js';
import { DOMAINS_MODULE_OPTIONS } from '../domains.constants.js';
import type { DomainsModuleOptions } from '../types/domains.types.js';

// ---------------------------------------------------------------------------
// Internal API response shapes
// ---------------------------------------------------------------------------

interface CfApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    total_pages: number;
    count: number;
    total_count: number;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CloudflareClient {
  private readonly logger = new Logger(CloudflareClient.name);
  private readonly config: CloudflareConfig;
  private readonly baseUrl: string;

  constructor(
    @Inject(DOMAINS_MODULE_OPTIONS) private readonly options: DomainsModuleOptions,
  ) {
    this.config = options.cloudflare;
    this.baseUrl = this.config.baseUrl ?? 'https://api.cloudflare.com/client/v4';
  }

  // ---------------------------------------------------------------------------
  // Zone operations
  // ---------------------------------------------------------------------------

  /**
   * Looks up the Cloudflare zone for a given domain.
   *
   * Handles both apex domains ("acme.com") and subdomains ("app.acme.com"):
   * it first tries the full domain, then progressively strips subdomains until
   * a zone is found.
   */
  async findZoneForDomain(domain: string): Promise<CloudflareZone> {
    const candidates = this.buildZoneCandidates(domain);

    for (const candidate of candidates) {
      const zones = await this.listZones(candidate);
      if (zones.length > 0) {
        const zone = zones[0];
        this.logger.debug(`Resolved zone ${zone.id} (${zone.name}) for domain ${domain}`);
        return zone;
      }
    }

    throw new NotFoundException(
      `No Cloudflare zone found for domain "${domain}". ` +
      `Ensure the domain or its apex is registered in your Cloudflare account.`,
    );
  }

  /**
   * Lists Cloudflare zones filtered by an exact name match.
   */
  async listZones(name?: string): Promise<CloudflareZone[]> {
    const params = new URLSearchParams();
    if (name) params.set('name', name);
    params.set('per_page', '50');

    const data = await this.request<CloudflareDnsZoneResult[]>(`/zones?${params}`);

    return data.map((z) => ({
      id: z.id,
      name: z.name,
      status: z.status,
      paused: z.paused,
      type: z.type,
      nameServers: z.name_servers ?? [],
    }));
  }

  // ---------------------------------------------------------------------------
  // DNS record operations
  // ---------------------------------------------------------------------------

  /**
   * Creates a new DNS record in the specified zone.
   */
  async createDnsRecord(input: CreateDnsRecordInput): Promise<CloudflareDnsRecord> {
    const body = {
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 1, // 1 = automatic
      proxied: input.proxied ?? false,
      comment: input.comment,
    };

    const data = await this.request<CfDnsRecordResult>(
      `/zones/${input.zoneId}/dns_records`,
      { method: 'POST', body: JSON.stringify(body) },
    );

    this.logger.log(`Created DNS record ${data.id} (${data.type} ${data.name}) in zone ${input.zoneId}`);
    return this.mapDnsRecord(data);
  }

  /**
   * Updates an existing DNS record (full replacement via PUT).
   */
  async updateDnsRecord(input: UpdateDnsRecordInput): Promise<CloudflareDnsRecord> {
    const body = {
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 1,
      proxied: input.proxied ?? false,
      comment: input.comment,
    };

    const data = await this.request<CfDnsRecordResult>(
      `/zones/${input.zoneId}/dns_records/${input.recordId}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );

    this.logger.log(`Updated DNS record ${data.id} in zone ${input.zoneId}`);
    return this.mapDnsRecord(data);
  }

  /**
   * Deletes a DNS record from a zone.
   */
  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request<{ id: string }>(
      `/zones/${zoneId}/dns_records/${recordId}`,
      { method: 'DELETE' },
    );
    this.logger.log(`Deleted DNS record ${recordId} from zone ${zoneId}`);
  }

  /**
   * Retrieves a single DNS record by ID.
   */
  async getDnsRecord(zoneId: string, recordId: string): Promise<CloudflareDnsRecord> {
    const data = await this.request<CfDnsRecordResult>(
      `/zones/${zoneId}/dns_records/${recordId}`,
    );
    return this.mapDnsRecord(data);
  }

  /**
   * Lists DNS records in a zone, optionally filtered by type and/or name.
   */
  async listDnsRecords(
    zoneId: string,
    options: { type?: string; name?: string } = {},
  ): Promise<CloudflareDnsRecord[]> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.name) params.set('name', options.name);
    params.set('per_page', '100');

    const data = await this.request<CfDnsRecordResult[]>(
      `/zones/${zoneId}/dns_records?${params}`,
    );
    return data.map((r) => this.mapDnsRecord(r));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildZoneCandidates(domain: string): string[] {
    // Strip trailing dot if present
    const clean = domain.replace(/\.$/, '');
    const parts = clean.split('.');
    const candidates: string[] = [];

    // Build from the full domain up to the apex (minimum 2 labels: "acme.com")
    for (let i = 0; i < parts.length - 1; i++) {
      candidates.push(parts.slice(i).join('.'));
    }
    return candidates;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
    };

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cloudflare API network error: ${message}`);
      throw new InternalServerErrorException(`Cloudflare API network error: ${message}`);
    }

    let json: CfApiResponse<T>;
    try {
      json = (await response.json()) as CfApiResponse<T>;
    } catch {
      throw new InternalServerErrorException(
        `Cloudflare API returned non-JSON response (status ${response.status})`,
      );
    }

    if (!json.success) {
      const errMsg = json.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      this.logger.error(`Cloudflare API error on ${path}: ${errMsg}`);

      if (response.status === 404) {
        throw new NotFoundException(`Cloudflare resource not found: ${errMsg}`);
      }
      throw new InternalServerErrorException(`Cloudflare API error: ${errMsg}`);
    }

    return json.result;
  }

  private mapDnsRecord(raw: CfDnsRecordResult): CloudflareDnsRecord {
    return {
      id: raw.id,
      type: raw.type as CloudflareDnsRecord['type'],
      name: raw.name,
      content: raw.content,
      ttl: raw.ttl,
      proxied: raw.proxied,
      zoneId: raw.zone_id,
      zoneName: raw.zone_name,
      createdOn: raw.created_on,
      modifiedOn: raw.modified_on,
    };
  }
}

// ---------------------------------------------------------------------------
// Private Cloudflare API raw response shapes (not exported)
// ---------------------------------------------------------------------------

interface CfDnsZoneResult {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  name_servers?: string[];
}

// Alias used in listZones
type CloudflareDnsZoneResult = CfDnsZoneResult;

interface CfDnsRecordResult {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  zone_id: string;
  zone_name: string;
  created_on: string;
  modified_on: string;
}
