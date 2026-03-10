// Duplicated from @unicore-license/license-types (not imported directly)

export type LicenseTier = 'community' | 'professional' | 'enterprise';
export type LicenseStatus = 'active' | 'expired' | 'suspended' | 'revoked';

export interface FeatureFlags {
  maxAgents: number;
  maxWorkflows: number;
  customBranding: boolean;
  ssoEnabled: boolean;
  auditLog: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  multiTenant: boolean;
  advancedAnalytics: boolean;
  whiteLabel: boolean;
}

export interface ValidationResult {
  valid: boolean;
  licenseKey: string;
  tier: LicenseTier;
  status: LicenseStatus;
  expiresAt: string;
  features: FeatureFlags;
  limits: {
    maxUsers: number;
    maxAgents: number;
    maxWorkflows: number;
  };
  cacheUntil?: string;
  message?: string;
}

export interface LicenseClientOptions {
  /** License key in format UC-XXXX-XXXX-XXXX-XXXX */
  licenseKey: string;
  /** License server URL */
  serverUrl: string;
  /** Cache duration in ms. Default: 7 days */
  cacheDurationMs?: number;
  /** Offline grace period in ms. Default: 30 days */
  offlineGracePeriodMs?: number;
  /** Custom cache file path (for testing). Default: ~/.unicore/license-cache.json */
  cacheFilePath?: string;
}

export interface CachedValidation {
  result: ValidationResult;
  timestamp: number;
  cacheUntil?: string;
}

export interface MachineFingerprint {
  cpuId: string;
  macAddress: string;
  diskId: string;
  hash: string;
}

export interface AnalyticsReport {
  licenseKey: string;
  timestamp: string;
  activeUsers: number;
  activeAgents: number;
  activeWorkflows: number;
  apiCalls: number;
  events?: Record<string, number>;
}
