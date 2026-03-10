/**
 * Data Transfer Objects for SSO API endpoints.
 * Uses plain classes so they work with NestJS ValidationPipe without
 * pulling in class-validator as a hard dependency of this package.
 */

import type { SsoProvider } from '../types/sso.types.js';

// ---------------------------------------------------------------------------
// Configuration DTOs
// ---------------------------------------------------------------------------

export class CreateSsoConfigDto {
  organizationId!: string;
  provider!: SsoProvider;
  isEnabled?: boolean;

  // SP
  entityId!: string;
  assertionConsumerServiceUrl!: string;
  singleLogoutUrl?: string;
  spCertificate?: string;
  spPrivateKey?: string;

  // IdP
  idpEntityId?: string;
  idpSsoUrl!: string;
  idpSloUrl?: string;
  idpCertificate!: string;
  idpMetadataUrl?: string;

  // Attribute mapping
  emailAttribute?: string;
  firstNameAttribute?: string;
  lastNameAttribute?: string;
  groupsAttribute?: string;
  customAttributeMap?: Record<string, string>;

  // JIT provisioning
  jitEnabled?: boolean;
  jitDefaultRole?: string;
  jitGroupRoleMap?: Record<string, string>;
  jitAllowedDomains?: string[];
}

export class UpdateSsoConfigDto {
  isEnabled?: boolean;
  idpSsoUrl?: string;
  idpSloUrl?: string;
  idpCertificate?: string;
  idpMetadataUrl?: string;
  spCertificate?: string;
  spPrivateKey?: string;
  emailAttribute?: string;
  firstNameAttribute?: string;
  lastNameAttribute?: string;
  groupsAttribute?: string;
  customAttributeMap?: Record<string, string>;
  jitEnabled?: boolean;
  jitDefaultRole?: string;
  jitGroupRoleMap?: Record<string, string>;
  jitAllowedDomains?: string[];
}

// ---------------------------------------------------------------------------
// Login / Callback DTOs
// ---------------------------------------------------------------------------

export class InitiateSsoLoginDto {
  organizationId!: string;
  redirectUrl?: string;
  forceAuthn?: boolean;
}

export class SamlCallbackDto {
  /** SAMLResponse (base64-encoded) from the IdP POST body. */
  SAMLResponse!: string;
  RelayState?: string;
}

export class InitiateSloDto {
  organizationId!: string;
  userId!: string;
  nameId!: string;
  nameIdFormat?: string;
  sessionIndex?: string;
}

// ---------------------------------------------------------------------------
// Metadata DTOs
// ---------------------------------------------------------------------------

export class ImportIdpMetadataDto {
  organizationId!: string;
  /** Raw XML metadata string. */
  metadataXml?: string;
  /** URL to fetch metadata from (alternative to providing raw XML). */
  metadataUrl?: string;
}
