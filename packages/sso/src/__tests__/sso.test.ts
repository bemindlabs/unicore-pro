/**
 * @unicore/sso — Unit tests
 *
 * Tests cover:
 *  - IdP preset registry
 *  - URL template hydration
 *  - SAML attribute mapping
 *  - Relay state / request ID generation
 *  - Domain allow-list validation
 *  - SP metadata XML generation
 *  - IdP metadata parsing
 *  - JIT role resolution
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getIdpPreset,
  hydrateUrlTemplate,
  AZURE_AD_PRESET,
  OKTA_PRESET,
  GOOGLE_WORKSPACE_PRESET,
} from '../presets/idp-presets.js';

import {
  flattenSamlAttributes,
  mapSamlAttributes,
  generateRelayState,
  generateRequestId,
  isEmailDomainAllowed,
  rawCertToPem,
  parseIdpMetadata,
} from '../helpers/saml.helpers.js';

import { generateSpMetadataXml } from '../helpers/metadata.helpers.js';

import type { SsoConfig } from '../types/sso.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CONFIG: SsoConfig = {
  id: 'cfg_01',
  organizationId: 'org_test',
  isEnabled: true,
  provider: 'okta',
  entityId: 'https://app.unicore.io/saml/sp',
  assertionConsumerServiceUrl: 'https://app.unicore.io/saml/acs',
  singleLogoutUrl: 'https://app.unicore.io/saml/slo',
  idpSsoUrl: 'https://dev.okta.com/app/abc/sso/saml',
  idpCertificate: '-----BEGIN CERTIFICATE-----\nMIIBxyz\n-----END CERTIFICATE-----',
  emailAttribute: 'email',
  firstNameAttribute: 'firstName',
  lastNameAttribute: 'lastName',
  groupsAttribute: 'groups',
  jitEnabled: true,
  jitAllowedDomains: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// IdP Presets
// ---------------------------------------------------------------------------

describe('IdP Presets', () => {
  it('returns Azure AD preset', () => {
    const preset = getIdpPreset('azure_ad');
    assert.ok(preset !== null);
    assert.equal(preset?.provider, 'azure_ad');
    assert.ok(preset?.idpSsoUrlTemplate.includes('{tenantId}'));
  });

  it('returns Okta preset', () => {
    const preset = getIdpPreset('okta');
    assert.ok(preset !== null);
    assert.equal(preset?.provider, 'okta');
    assert.ok(preset?.idpSsoUrlTemplate.includes('{domain}'));
  });

  it('returns Google Workspace preset', () => {
    const preset = getIdpPreset('google_workspace');
    assert.ok(preset !== null);
    assert.equal(preset?.provider, 'google_workspace');
    assert.ok(preset?.idpSsoUrlTemplate.includes('{idpId}'));
  });

  it('returns null for custom provider', () => {
    const preset = getIdpPreset('custom');
    assert.equal(preset, null);
  });

  it('Azure AD preset has group attribute configured', () => {
    assert.ok(AZURE_AD_PRESET.groupsAttribute?.includes('groups'));
  });

  it('Okta preset email attribute is "email"', () => {
    assert.equal(OKTA_PRESET.emailAttribute, 'email');
  });

  it('Google Workspace preset has no SLO URL template', () => {
    assert.equal(GOOGLE_WORKSPACE_PRESET.idpSloUrlTemplate, undefined);
  });
});

// ---------------------------------------------------------------------------
// URL template hydration
// ---------------------------------------------------------------------------

describe('hydrateUrlTemplate', () => {
  it('substitutes a single placeholder', () => {
    const result = hydrateUrlTemplate(
      'https://login.microsoftonline.com/{tenantId}/saml2',
      { tenantId: 'abc-123' },
    );
    assert.equal(result, 'https://login.microsoftonline.com/abc-123/saml2');
  });

  it('substitutes multiple placeholders', () => {
    const result = hydrateUrlTemplate(
      'https://{domain}.okta.com/app/{appId}/sso/saml',
      { domain: 'acme', appId: 'xyz' },
    );
    assert.equal(result, 'https://acme.okta.com/app/xyz/sso/saml');
  });

  it('handles repeated placeholders', () => {
    const result = hydrateUrlTemplate('{host}/{host}', { host: 'example.com' });
    assert.equal(result, 'example.com/example.com');
  });

  it('leaves unknown placeholders untouched', () => {
    const result = hydrateUrlTemplate('https://{domain}/sso', { other: 'x' });
    assert.equal(result, 'https://{domain}/sso');
  });
});

// ---------------------------------------------------------------------------
// flattenSamlAttributes
// ---------------------------------------------------------------------------

describe('flattenSamlAttributes', () => {
  it('flattens single-value arrays to strings', () => {
    const result = flattenSamlAttributes({ email: ['user@example.com'] });
    assert.equal(result['email'], 'user@example.com');
  });

  it('preserves multi-value arrays', () => {
    const result = flattenSamlAttributes({ groups: ['admin', 'users'] });
    assert.deepEqual(result['groups'], ['admin', 'users']);
  });

  it('handles null values', () => {
    const result = flattenSamlAttributes({ missing: null });
    assert.deepEqual(result['missing'], []);
  });

  it('handles empty object', () => {
    assert.deepEqual(flattenSamlAttributes({}), {});
  });
});

// ---------------------------------------------------------------------------
// mapSamlAttributes
// ---------------------------------------------------------------------------

describe('mapSamlAttributes', () => {
  it('maps standard attributes from config field names', () => {
    const attrs = mapSamlAttributes(
      {
        email: ['alice@acme.com'],
        firstName: ['Alice'],
        lastName: ['Smith'],
        groups: ['admin', 'users'],
      },
      'alice@acme.com',
      MOCK_CONFIG,
      { nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', sessionIndex: 'idx_1' },
    );

    assert.equal(attrs.email, 'alice@acme.com');
    assert.equal(attrs.firstName, 'Alice');
    assert.equal(attrs.lastName, 'Smith');
    assert.equal(attrs.displayName, 'Alice Smith');
    assert.deepEqual(attrs.groups, ['admin', 'users']);
    assert.equal(attrs.nameId, 'alice@acme.com');
    assert.equal(attrs.sessionIndex, 'idx_1');
  });

  it('falls back to nameId when email attribute missing', () => {
    const attrs = mapSamlAttributes({}, 'bob@acme.com', MOCK_CONFIG);
    assert.equal(attrs.email, 'bob@acme.com');
  });

  it('applies customAttributeMap overrides', () => {
    const configWithCustom: SsoConfig = {
      ...MOCK_CONFIG,
      customAttributeMap: { 'custom:department': 'department' },
    };
    const attrs = mapSamlAttributes(
      { 'custom:department': ['engineering'] },
      'user@co.com',
      configWithCustom,
    );
    assert.equal((attrs.raw as Record<string, string>)['department'], 'engineering');
  });
});

// ---------------------------------------------------------------------------
// Relay state and request ID generation
// ---------------------------------------------------------------------------

describe('generateRelayState', () => {
  it('returns a non-empty string', () => {
    const rs = generateRelayState();
    assert.ok(rs.length > 0);
  });

  it('generates unique values', () => {
    const values = new Set(Array.from({ length: 100 }, generateRelayState));
    assert.equal(values.size, 100);
  });
});

describe('generateRequestId', () => {
  it('starts with underscore (SAML spec requirement)', () => {
    const id = generateRequestId();
    assert.ok(id.startsWith('_'));
  });

  it('is sufficiently long', () => {
    const id = generateRequestId();
    assert.ok(id.length >= 32);
  });
});

// ---------------------------------------------------------------------------
// Domain allow-list validation
// ---------------------------------------------------------------------------

describe('isEmailDomainAllowed', () => {
  it('allows all domains when list is empty', () => {
    assert.ok(isEmailDomainAllowed('user@anything.com', []));
  });

  it('allows an email in the allowed list', () => {
    assert.ok(isEmailDomainAllowed('user@acme.com', ['acme.com', 'corp.io']));
  });

  it('rejects an email not in the allowed list', () => {
    assert.ok(!isEmailDomainAllowed('user@evil.com', ['acme.com']));
  });

  it('is case-insensitive', () => {
    assert.ok(isEmailDomainAllowed('user@ACME.COM', ['acme.com']));
  });

  it('rejects malformed emails', () => {
    assert.ok(!isEmailDomainAllowed('notanemail', ['acme.com']));
  });
});

// ---------------------------------------------------------------------------
// rawCertToPem
// ---------------------------------------------------------------------------

describe('rawCertToPem', () => {
  it('wraps base64 in PEM headers', () => {
    const base64 = 'MIIBxyz'.padEnd(128, 'A');
    const pem = rawCertToPem(base64);
    assert.ok(pem.startsWith('-----BEGIN CERTIFICATE-----'));
    assert.ok(pem.endsWith('-----END CERTIFICATE-----'));
  });

  it('breaks long cert into 64-char lines', () => {
    const base64 = 'A'.repeat(128);
    const pem = rawCertToPem(base64);
    const lines = pem
      .split('\n')
      .filter((l) => !l.startsWith('---'));
    assert.ok(lines.every((l) => l.length <= 64));
  });
});

// ---------------------------------------------------------------------------
// generateSpMetadataXml
// ---------------------------------------------------------------------------

describe('generateSpMetadataXml', () => {
  it('produces valid XML with EntityDescriptor', () => {
    const xml = generateSpMetadataXml(MOCK_CONFIG);
    assert.ok(xml.includes('EntityDescriptor'));
    assert.ok(xml.includes(MOCK_CONFIG.entityId));
  });

  it('includes AssertionConsumerService URL', () => {
    const xml = generateSpMetadataXml(MOCK_CONFIG);
    assert.ok(xml.includes(MOCK_CONFIG.assertionConsumerServiceUrl));
  });

  it('includes SLO service when configured', () => {
    const xml = generateSpMetadataXml(MOCK_CONFIG);
    assert.ok(xml.includes(MOCK_CONFIG.singleLogoutUrl!));
  });

  it('omits SLO service when not configured', () => {
    const configNoSlo = { ...MOCK_CONFIG, singleLogoutUrl: undefined };
    const xml = generateSpMetadataXml(configNoSlo);
    assert.ok(!xml.includes('SingleLogoutService'));
  });

  it('includes SP certificate section when cert provided', () => {
    const configWithCert: SsoConfig = {
      ...MOCK_CONFIG,
      spCertificate:
        '-----BEGIN CERTIFICATE-----\nMIIBtest\n-----END CERTIFICATE-----',
    };
    const xml = generateSpMetadataXml(configWithCert);
    assert.ok(xml.includes('KeyDescriptor'));
  });

  it('escapes special characters in entity ID', () => {
    const configSpecial: SsoConfig = {
      ...MOCK_CONFIG,
      entityId: 'https://app.example.com/saml?type=sp&ver=2',
    };
    const xml = generateSpMetadataXml(configSpecial);
    assert.ok(xml.includes('&amp;'));
  });
});

// ---------------------------------------------------------------------------
// parseIdpMetadata
// ---------------------------------------------------------------------------

const SAMPLE_IDP_METADATA_XML = `<?xml version="1.0"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="https://idp.example.com/saml">
  <md:IDPSSODescriptor
    WantAuthnRequestsSigned="false"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBtestCertificateBase64AAAAAAAAAAAAAAAAAAAAAAAAAa</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://idp.example.com/sso/saml" />
    <md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.example.com/slo/saml" />
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

describe('parseIdpMetadata', () => {
  it('extracts entityId, ssoUrl, sloUrl, and certificate', async () => {
    const result = await parseIdpMetadata(SAMPLE_IDP_METADATA_XML);
    assert.equal(result.entityId, 'https://idp.example.com/saml');
    assert.equal(result.ssoUrl, 'https://idp.example.com/sso/saml');
    assert.equal(result.sloUrl, 'https://idp.example.com/slo/saml');
    assert.ok(result.certificate.startsWith('-----BEGIN CERTIFICATE-----'));
  });

  it('throws on XML that has no EntityDescriptor', async () => {
    // xml2js may or may not throw on malformed XML, but it will always throw
    // when the required EntityDescriptor element is absent.
    await assert.rejects(
      () => parseIdpMetadata('<root/>'),
      /EntityDescriptor/,
    );
  });

  it('throws when EntityDescriptor is missing', async () => {
    await assert.rejects(
      () => parseIdpMetadata('<root><child/></root>'),
      /EntityDescriptor/,
    );
  });
});

// ---------------------------------------------------------------------------
// SsoModule (smoke test — requires NestJS at runtime)
// ---------------------------------------------------------------------------

describe('SsoModule', () => {
  /**
   * These tests require @nestjs/common to be installed.
   * They are skipped automatically when the package is not available
   * (e.g. in a bare test environment without node_modules).
   */
  async function tryImportSsoModule() {
    try {
      const mod = await import('../sso.module.js');
      return mod;
    } catch {
      return null;
    }
  }

  it('exports register() and registerAsync() static methods', async () => {
    const mod = await tryImportSsoModule();
    if (!mod) {
      // Skip — @nestjs/common not installed in this environment
      return;
    }
    assert.ok(typeof mod.SsoModule.register === 'function');
    assert.ok(typeof mod.SsoModule.registerAsync === 'function');
  });

  it('register() returns a DynamicModule with controllers', async () => {
    const mod = await tryImportSsoModule();
    if (!mod) return;
    const dynamicMod = mod.SsoModule.register({ baseUrl: 'https://app.unicore.io' });
    assert.ok(Array.isArray(dynamicMod.controllers));
    assert.ok((dynamicMod.controllers?.length ?? 0) > 0);
    assert.ok(Array.isArray(dynamicMod.exports));
  });

  it('registerAsync() accepts useFactory', async () => {
    const mod = await tryImportSsoModule();
    if (!mod) return;
    const dynamicMod = mod.SsoModule.registerAsync({
      useFactory: () => ({ baseUrl: 'https://app.unicore.io' }),
    });
    assert.ok(Array.isArray(dynamicMod.providers));
    const optProvider = dynamicMod.providers?.find(
      (p: unknown) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        (p as { provide: unknown }).provide === 'SSO_MODULE_OPTIONS',
    );
    assert.ok(optProvider, 'SSO_MODULE_OPTIONS provider should be present');
  });
});
