/**
 * Helpers for generating SP SAML metadata XML.
 */

import type { SsoConfig } from '../types/sso.types.js';

/**
 * Generates a SAML 2.0 SP metadata XML document for the given SsoConfig.
 * This XML is served at the SP metadata endpoint so IdP admins can
 * configure the trust relationship.
 */
export function generateSpMetadataXml(config: SsoConfig): string {
  const spCertSection = config.spCertificate
    ? `
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${stripPemHeaders(config.spCertificate)}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:KeyDescriptor use="encryption">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${stripPemHeaders(config.spCertificate)}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>`
    : '';

  const sloSection = config.singleLogoutUrl
    ? `
    <md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="${escapeXml(config.singleLogoutUrl)}" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${escapeXml(config.entityId)}"
  validUntil="${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">${spCertSection}${sloSection}
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${escapeXml(config.assertionConsumerServiceUrl)}"
      index="1"
      isDefault="true" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

/**
 * Strips PEM header/footer lines and whitespace, leaving only the base64 body.
 */
function stripPemHeaders(pem: string): string {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Escapes special XML characters in attribute values.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
