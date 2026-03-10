/**
 * SAML utility helpers: XML parsing, attribute extraction, metadata parsing.
 */

import { parseStringPromise } from 'xml2js';
import type { SamlUserAttributes, SsoConfig, ParsedIdpMetadata } from '../types/sso.types.js';

// ---------------------------------------------------------------------------
// Attribute extraction
// ---------------------------------------------------------------------------

/**
 * Resolves a SAML attribute value.  SAML attribute values may be strings or
 * arrays; we always return a flat string[] for consistency.
 */
function resolveAttributeValues(
  raw: unknown,
): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((v) => resolveAttributeValues(v));
  }
  if (raw !== null && raw !== undefined) {
    return [String(raw)];
  }
  return [];
}

/**
 * Flattens the SAML attributes bag into a simple Record<string, string | string[]>.
 * The format from passport-saml / @node-saml is:
 *   { 'urn:oid:...': [ 'value' ], ... }
 */
export function flattenSamlAttributes(
  raw: Record<string, unknown>,
): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => {
      const values = resolveAttributeValues(value);
      return [key, values.length === 1 ? (values[0] as string) : values];
    }),
  );
}

/**
 * Extracts a single scalar string from a SAML attribute value.
 * Returns undefined if the attribute is absent or empty.
 */
function pickFirst(
  attrs: Record<string, string | string[]>,
  key: string,
): string | undefined {
  const val = attrs[key];
  if (!val) return undefined;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * Extracts all values from a SAML attribute as a string array.
 */
function pickAll(
  attrs: Record<string, string | string[]>,
  key: string,
): string[] | undefined {
  const val = attrs[key];
  if (!val) return undefined;
  return Array.isArray(val) ? val : [val];
}

/**
 * Maps raw SAML assertion attributes to our normalized SamlUserAttributes
 * using the field names configured in SsoConfig.
 */
export function mapSamlAttributes(
  rawAttrs: Record<string, unknown>,
  nameId: string,
  config: SsoConfig,
  options: { nameIdFormat?: string; sessionIndex?: string } = {},
): SamlUserAttributes {
  const flat = flattenSamlAttributes(rawAttrs);

  const email =
    pickFirst(flat, config.emailAttribute) ??
    pickFirst(flat, 'email') ??
    nameId; // fallback to nameId if email attribute is absent

  const firstName = pickFirst(flat, config.firstNameAttribute);
  const lastName = pickFirst(flat, config.lastNameAttribute);
  const groups = config.groupsAttribute
    ? pickAll(flat, config.groupsAttribute)
    : undefined;

  // Apply any custom attribute overrides
  const custom: Record<string, string | string[]> = {};
  if (config.customAttributeMap) {
    for (const [samlAttr, userField] of Object.entries(config.customAttributeMap)) {
      const v = flat[samlAttr];
      if (v !== undefined) custom[userField] = v;
    }
  }

  const displayName =
    firstName && lastName
      ? `${firstName} ${lastName}`
      : firstName ?? lastName ?? email;

  return {
    nameId,
    nameIdFormat: options.nameIdFormat,
    sessionIndex: options.sessionIndex,
    email,
    firstName,
    lastName,
    displayName,
    groups,
    raw: { ...flat, ...custom },
  };
}

// ---------------------------------------------------------------------------
// IdP Metadata parsing
// ---------------------------------------------------------------------------

/**
 * Parses an IdP SAML XML metadata document and returns the fields we need.
 * Supports the standard EntityDescriptor / IDPSSODescriptor format.
 */
export async function parseIdpMetadata(xmlString: string): Promise<ParsedIdpMetadata> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await parseStringPromise(xmlString, {
    explicitArray: true,
    tagNameProcessors: [(name: string) => name.replace(/^.*:/, '')], // strip namespace prefix
  });

  const descriptor =
    doc?.EntityDescriptor ??
    doc?.['md:EntityDescriptor'] ??
    (() => { throw new Error('Invalid SAML metadata: missing EntityDescriptor'); })();

  const entityId: string =
    descriptor.$?.entityID ??
    descriptor.$?.['entityID'] ??
    (() => { throw new Error('Invalid SAML metadata: missing entityID attribute'); })();

  const idpDescriptor =
    descriptor.IDPSSODescriptor?.[0] ??
    (() => { throw new Error('Invalid SAML metadata: missing IDPSSODescriptor'); })();

  // SSO service URL
  const ssoServices: Array<{ $: { Binding: string; Location: string } }> =
    idpDescriptor.SingleSignOnService ?? [];
  const postSso = ssoServices.find((s) =>
    s.$?.Binding?.includes('HTTP-POST'),
  );
  const redirectSso = ssoServices.find((s) =>
    s.$?.Binding?.includes('HTTP-Redirect'),
  );
  const ssoService = postSso ?? redirectSso ?? ssoServices[0];
  const ssoUrl = ssoService?.$?.Location;
  if (!ssoUrl) throw new Error('Invalid SAML metadata: no SingleSignOnService found');

  // SLO service URL (optional)
  const sloServices: Array<{ $: { Binding: string; Location: string } }> =
    idpDescriptor.SingleLogoutService ?? [];
  const sloService = sloServices[0];
  const sloUrl = sloService?.$?.Location;

  // Signing certificate
  const keyDescriptors: Array<{
    $?: { use?: string };
    KeyInfo?: Array<{ X509Data?: Array<{ X509Certificate?: string[] }> }>;
  }> = idpDescriptor.KeyDescriptor ?? [];

  const signingKey =
    keyDescriptors.find((kd) => kd.$?.use === 'signing') ??
    keyDescriptors[0];

  const rawCert = signingKey?.KeyInfo?.[0]?.X509Data?.[0]?.X509Certificate?.[0];
  if (!rawCert) throw new Error('Invalid SAML metadata: no X509Certificate found');

  // Normalize the cert to PEM format
  const certificate = rawCertToPem(rawCert.replace(/\s+/g, ''));

  return { entityId, ssoUrl, sloUrl, certificate };
}

/**
 * Wraps a raw base64 X.509 certificate string in PEM headers.
 */
export function rawCertToPem(base64: string): string {
  const cleaned = base64.replace(/\s/g, '');
  const lines = cleaned.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

// ---------------------------------------------------------------------------
// Relay state / request ID generation
// ---------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';

/**
 * Generates a cryptographically random relay state value (URL-safe base64).
 */
export function generateRelayState(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generates a SAML request ID in the format required by the spec.
 * Must start with a letter or underscore.
 */
export function generateRequestId(): string {
  return `_${randomBytes(20).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------

/**
 * Checks whether an email address belongs to one of the allowed domains.
 * An empty allowedDomains list means all domains are permitted.
 */
export function isEmailDomainAllowed(
  email: string,
  allowedDomains: string[],
): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return allowedDomains.some((d) => d.toLowerCase() === domain);
}
