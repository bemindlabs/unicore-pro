/**
 * Core SSO / SAML type definitions for @unicore/sso.
 */

// ---------------------------------------------------------------------------
// Provider Identifiers
// ---------------------------------------------------------------------------

export type SsoProvider =
  | 'azure_ad'
  | 'okta'
  | 'google_workspace'
  | 'custom';

// ---------------------------------------------------------------------------
// SP / IdP Configuration
// ---------------------------------------------------------------------------

/**
 * Full SSO configuration for a single organization.
 * Matches the SsoConfiguration Prisma model.
 */
export interface SsoConfig {
  id: string;
  organizationId: string;
  isEnabled: boolean;
  provider: SsoProvider;

  // Service Provider (us)
  entityId: string;
  assertionConsumerServiceUrl: string;
  singleLogoutUrl?: string;
  spCertificate?: string;   // PEM
  spPrivateKey?: string;    // PEM, encrypted at rest

  // Identity Provider (them)
  idpEntityId?: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;   // PEM — used to verify assertion signatures
  idpMetadataUrl?: string;

  // Attribute mapping
  emailAttribute: string;
  firstNameAttribute: string;
  lastNameAttribute: string;
  groupsAttribute?: string;
  customAttributeMap?: Record<string, string>;

  // JIT provisioning
  jitEnabled: boolean;
  jitDefaultRole?: string;
  jitGroupRoleMap?: Record<string, string>;
  jitAllowedDomains: string[];

  lastMetadataRefresh?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

/**
 * Minimal config required to create a new SsoConfiguration.
 */
export type CreateSsoConfigInput = Omit<
  SsoConfig,
  'id' | 'createdAt' | 'updatedAt' | 'lastMetadataRefresh'
>;

/**
 * Partial update for SsoConfiguration.
 */
export type UpdateSsoConfigInput = Partial<
  Omit<SsoConfig, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
>;

// ---------------------------------------------------------------------------
// SAML Assertion / Attributes
// ---------------------------------------------------------------------------

/**
 * Normalized user attributes extracted from a SAML assertion.
 */
export interface SamlUserAttributes {
  nameId: string;
  nameIdFormat?: string;
  sessionIndex?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string[];
  raw: Record<string, string | string[]>;
}

/**
 * Result of parsing a SAML callback (assertion).
 */
export interface SamlCallbackResult {
  attributes: SamlUserAttributes;
  relayState?: string;
  inResponseTo?: string;
}

// ---------------------------------------------------------------------------
// Login Flow
// ---------------------------------------------------------------------------

/**
 * Options for initiating an SSO login flow.
 */
export interface InitiateSsoLoginOptions {
  organizationId: string;
  /** URL to redirect to after successful authentication. */
  redirectUrl?: string;
  /** Extra parameters forwarded to the IdP. */
  forceAuthn?: boolean;
}

/**
 * The outcome of initiating SSO — contains the redirect URL to the IdP.
 */
export interface InitiateSsoLoginResult {
  /** Full URL to redirect the browser to (IdP SSO endpoint with SAMLRequest). */
  redirectUrl: string;
  /** RelayState value tracked server-side. */
  relayState: string;
  /** SAML RequestID for correlation. */
  requestId: string;
}

// ---------------------------------------------------------------------------
// JIT Provisioning
// ---------------------------------------------------------------------------

/**
 * Input to the JIT provisioner.
 */
export interface JitProvisionInput {
  organizationId: string;
  provider: SsoProvider;
  config: SsoConfig;
  attributes: SamlUserAttributes;
}

/**
 * Result from JIT provisioning — either a newly created or existing user.
 */
export interface JitProvisionResult {
  userId: string;
  email: string;
  isNewUser: boolean;
  assignedRole?: string;
}

// ---------------------------------------------------------------------------
// SLO (Single Logout)
// ---------------------------------------------------------------------------

export interface InitiateSloOptions {
  organizationId: string;
  userId: string;
  nameId: string;
  nameIdFormat?: string;
  sessionIndex?: string;
}

export interface InitiateSloResult {
  redirectUrl: string;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Parsed IdP metadata fields we care about.
 */
export interface ParsedIdpMetadata {
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
}

// ---------------------------------------------------------------------------
// Module Options
// ---------------------------------------------------------------------------

export interface SsoModuleOptions {
  /**
   * Base URL of the SP (e.g. https://app.unicore.io).
   * Used to derive default ACS and metadata URLs.
   */
  baseUrl: string;

  /**
   * If true, all SAML assertions must be signed.
   * Defaults to true.
   */
  requireSignedAssertions?: boolean;

  /**
   * If true, incoming SAML responses must be signed.
   * Defaults to true.
   */
  requireSignedResponses?: boolean;

  /**
   * Clock skew tolerance in seconds.
   * Defaults to 300 (5 minutes).
   */
  clockSkewSeconds?: number;
}
