/**
 * SsoConfigService — CRUD for SsoConfiguration records.
 * Handles storage, retrieval, and IdP metadata auto-import.
 */

import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type {
  SsoConfig,
  CreateSsoConfigInput,
  UpdateSsoConfigInput,
  ParsedIdpMetadata,
} from '../types/sso.types.js';
import { parseIdpMetadata } from '../helpers/saml.helpers.js';

@Injectable()
export class SsoConfigService {
  private readonly logger = new Logger(SsoConfigService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(input: CreateSsoConfigInput): Promise<SsoConfig> {
    const existing = await this.prisma.ssoConfiguration.findUnique({
      where: { organizationId: input.organizationId },
    });
    if (existing) {
      throw new ConflictException(
        `SSO configuration already exists for organization ${input.organizationId}`,
      );
    }

    const record = await this.prisma.ssoConfiguration.create({
      data: {
        ...input,
        jitAllowedDomains: input.jitAllowedDomains ?? [],
        emailAttribute: input.emailAttribute ?? 'email',
        firstNameAttribute: input.firstNameAttribute ?? 'firstName',
        lastNameAttribute: input.lastNameAttribute ?? 'lastName',
        isEnabled: input.isEnabled ?? false,
        jitEnabled: input.jitEnabled ?? true,
      },
    });

    return this.toSsoConfig(record);
  }

  async findByOrganization(organizationId: string): Promise<SsoConfig> {
    const record = await this.prisma.ssoConfiguration.findUnique({
      where: { organizationId },
    });
    if (!record) {
      throw new NotFoundException(
        `No SSO configuration found for organization ${organizationId}`,
      );
    }
    return this.toSsoConfig(record);
  }

  async findById(id: string): Promise<SsoConfig> {
    const record = await this.prisma.ssoConfiguration.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`SsoConfiguration ${id} not found`);
    }
    return this.toSsoConfig(record);
  }

  async update(id: string, input: UpdateSsoConfigInput): Promise<SsoConfig> {
    await this.findById(id); // throws if not found
    const record = await this.prisma.ssoConfiguration.update({
      where: { id },
      data: input,
    });
    return this.toSsoConfig(record);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.ssoConfiguration.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // IdP Metadata import
  // ---------------------------------------------------------------------------

  /**
   * Fetches and parses IdP metadata from a URL, then patches the config.
   */
  async refreshIdpMetadata(id: string): Promise<SsoConfig> {
    const config = await this.findById(id);
    if (!config.idpMetadataUrl) {
      throw new ConflictException(
        `SsoConfiguration ${id} has no idpMetadataUrl configured`,
      );
    }

    const metadata = await this.fetchAndParseMetadata(config.idpMetadataUrl);
    return this.applyMetadata(id, metadata);
  }

  /**
   * Parses raw IdP metadata XML and patches the config.
   */
  async importIdpMetadataXml(id: string, xml: string): Promise<SsoConfig> {
    const metadata = await parseIdpMetadata(xml);
    return this.applyMetadata(id, metadata);
  }

  private async applyMetadata(
    id: string,
    metadata: ParsedIdpMetadata,
  ): Promise<SsoConfig> {
    const record = await this.prisma.ssoConfiguration.update({
      where: { id },
      data: {
        idpEntityId: metadata.entityId,
        idpSsoUrl: metadata.ssoUrl,
        idpSloUrl: metadata.sloUrl,
        idpCertificate: metadata.certificate,
        lastMetadataRefresh: new Date(),
      },
    });
    this.logger.log(`IdP metadata refreshed for SsoConfiguration ${id}`);
    return this.toSsoConfig(record);
  }

  private async fetchAndParseMetadata(url: string): Promise<ParsedIdpMetadata> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch IdP metadata from ${url}: ${response.status} ${response.statusText}`,
      );
    }
    const xml = await response.text();
    return parseIdpMetadata(xml);
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toSsoConfig(record: any): SsoConfig {
    return {
      id: record.id,
      organizationId: record.organizationId,
      isEnabled: record.isEnabled,
      provider: record.provider,
      entityId: record.entityId,
      assertionConsumerServiceUrl: record.assertionConsumerServiceUrl,
      singleLogoutUrl: record.singleLogoutUrl ?? undefined,
      spCertificate: record.spCertificate ?? undefined,
      spPrivateKey: record.spPrivateKey ?? undefined,
      idpEntityId: record.idpEntityId ?? undefined,
      idpSsoUrl: record.idpSsoUrl,
      idpSloUrl: record.idpSloUrl ?? undefined,
      idpCertificate: record.idpCertificate,
      idpMetadataUrl: record.idpMetadataUrl ?? undefined,
      emailAttribute: record.emailAttribute,
      firstNameAttribute: record.firstNameAttribute,
      lastNameAttribute: record.lastNameAttribute,
      groupsAttribute: record.groupsAttribute ?? undefined,
      customAttributeMap: (record.customAttributeMap as Record<string, string>) ?? undefined,
      jitEnabled: record.jitEnabled,
      jitDefaultRole: record.jitDefaultRole ?? undefined,
      jitGroupRoleMap: (record.jitGroupRoleMap as Record<string, string>) ?? undefined,
      jitAllowedDomains: record.jitAllowedDomains ?? [],
      lastMetadataRefresh: record.lastMetadataRefresh ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdBy: record.createdBy ?? undefined,
    };
  }
}
