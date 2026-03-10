/**
 * Pre-defined IdP configuration presets for common providers.
 *
 * Each preset supplies sensible defaults so operators only need to provide
 * their tenant-specific values (tenant ID, domain, client cert, etc.).
 */

import type { SsoProvider } from '../types/sso.types.js';

// ---------------------------------------------------------------------------
// Preset interface
// ---------------------------------------------------------------------------

export interface IdpPresetDefaults {
  provider: SsoProvider;
  displayName: string;
  /** Human-readable setup instructions URL */
  docsUrl: string;
  emailAttribute: string;
  firstNameAttribute: string;
  lastNameAttribute: string;
  groupsAttribute?: string;
  /**
   * Template for the IdP SSO URL — may contain placeholders such as
   * {tenantId}, {domain} that the user must fill in.
   */
  idpSsoUrlTemplate: string;
  idpSloUrlTemplate?: string;
  idpMetadataUrlTemplate?: string;
  nameIdFormat: string;
}

// ---------------------------------------------------------------------------
// Azure Active Directory (Entra ID)
// ---------------------------------------------------------------------------

export const AZURE_AD_PRESET: IdpPresetDefaults = {
  provider: 'azure_ad',
  displayName: 'Microsoft Azure AD / Entra ID',
  docsUrl:
    'https://learn.microsoft.com/en-us/azure/active-directory/develop/single-sign-on-saml-protocol',
  emailAttribute:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  firstNameAttribute:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  lastNameAttribute:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  groupsAttribute:
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
  idpSsoUrlTemplate:
    'https://login.microsoftonline.com/{tenantId}/saml2',
  idpSloUrlTemplate:
    'https://login.microsoftonline.com/{tenantId}/saml2',
  idpMetadataUrlTemplate:
    'https://login.microsoftonline.com/{tenantId}/federationmetadata/2007-06/federationmetadata.xml',
  nameIdFormat:
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
};

// ---------------------------------------------------------------------------
// Okta
// ---------------------------------------------------------------------------

export const OKTA_PRESET: IdpPresetDefaults = {
  provider: 'okta',
  displayName: 'Okta',
  docsUrl:
    'https://developer.okta.com/docs/guides/build-sso-integration/saml2/main/',
  emailAttribute: 'email',
  firstNameAttribute: 'firstName',
  lastNameAttribute: 'lastName',
  groupsAttribute: 'groups',
  idpSsoUrlTemplate:
    'https://{domain}.okta.com/app/{appId}/sso/saml',
  idpSloUrlTemplate:
    'https://{domain}.okta.com/app/{appId}/slo/saml',
  idpMetadataUrlTemplate:
    'https://{domain}.okta.com/app/{appId}/sso/saml/metadata',
  nameIdFormat:
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
};

// ---------------------------------------------------------------------------
// Google Workspace
// ---------------------------------------------------------------------------

export const GOOGLE_WORKSPACE_PRESET: IdpPresetDefaults = {
  provider: 'google_workspace',
  displayName: 'Google Workspace',
  docsUrl:
    'https://support.google.com/a/answer/6087519',
  emailAttribute:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  firstNameAttribute:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  lastNameAttribute:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  groupsAttribute: undefined,
  idpSsoUrlTemplate:
    'https://accounts.google.com/o/saml2/idp?idpid={idpId}',
  idpSloUrlTemplate: undefined,
  idpMetadataUrlTemplate:
    'https://accounts.google.com/o/saml2/idp?idpid={idpId}',
  nameIdFormat:
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const IDP_PRESETS: Readonly<Record<SsoProvider, IdpPresetDefaults | null>> = {
  azure_ad: AZURE_AD_PRESET,
  okta: OKTA_PRESET,
  google_workspace: GOOGLE_WORKSPACE_PRESET,
  custom: null,
};

/**
 * Returns the preset for a given provider or null if the provider is 'custom'.
 */
export function getIdpPreset(provider: SsoProvider): IdpPresetDefaults | null {
  return IDP_PRESETS[provider] ?? null;
}

/**
 * Hydrates a URL template by substituting `{placeholder}` tokens.
 *
 * @example
 * hydrateUrlTemplate(
 *   'https://login.microsoftonline.com/{tenantId}/saml2',
 *   { tenantId: 'abc-123' }
 * );
 * // => 'https://login.microsoftonline.com/abc-123/saml2'
 */
export function hydrateUrlTemplate(
  template: string,
  params: Record<string, string>,
): string {
  return Object.entries(params).reduce(
    (url, [key, value]) => url.replaceAll(`{${key}}`, value),
    template,
  );
}
