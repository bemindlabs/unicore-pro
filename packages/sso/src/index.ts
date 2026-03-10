/**
 * @unicore/sso — Public API
 *
 * SSO / SAML 2.0 Service Provider implementation for UniCore Pro.
 * Supports Azure AD, Okta, Google Workspace, and custom IdPs.
 * Includes JIT user provisioning and NestJS dynamic module.
 */

// Module
export { SsoModule } from './sso.module.js';
export type { SsoModuleAsyncOptions } from './sso.module.js';

// Services
export { SsoService } from './services/sso.service.js';
export { SsoConfigService } from './services/sso-config.service.js';
export { JitProvisionerService } from './services/jit-provisioner.service.js';

// Guards
export { SsoAuthGuard } from './guards/sso-auth.guard.js';
export type { SsoSession } from './guards/sso-auth.guard.js';

// Decorators
export {
  SsoRequired,
  SsoOrganization,
  SsoUser,
  SSO_REQUIRED_KEY,
} from './decorators/sso.decorators.js';
export type { SsoRequestUser } from './decorators/sso.decorators.js';

// Types
export type {
  SsoConfig,
  SsoProvider,
  CreateSsoConfigInput,
  UpdateSsoConfigInput,
  SamlUserAttributes,
  SamlCallbackResult,
  InitiateSsoLoginOptions,
  InitiateSsoLoginResult,
  JitProvisionInput,
  JitProvisionResult,
  InitiateSloOptions,
  InitiateSloResult,
  ParsedIdpMetadata,
  SsoModuleOptions,
} from './types/sso.types.js';

// DTOs
export {
  CreateSsoConfigDto,
  UpdateSsoConfigDto,
  InitiateSsoLoginDto,
  SamlCallbackDto,
  InitiateSloDto,
  ImportIdpMetadataDto,
} from './dto/sso.dto.js';

// IdP Presets
export {
  AZURE_AD_PRESET,
  OKTA_PRESET,
  GOOGLE_WORKSPACE_PRESET,
  IDP_PRESETS,
  getIdpPreset,
  hydrateUrlTemplate,
} from './presets/idp-presets.js';
export type { IdpPresetDefaults } from './presets/idp-presets.js';

// Helpers
export {
  mapSamlAttributes,
  flattenSamlAttributes,
  parseIdpMetadata,
  rawCertToPem,
  generateRelayState,
  generateRequestId,
  isEmailDomainAllowed,
} from './helpers/saml.helpers.js';
export { generateSpMetadataXml } from './helpers/metadata.helpers.js';

// Constants
export { SSO_MODULE_OPTIONS, SSO_PRISMA_CLIENT } from './sso.constants.js';
