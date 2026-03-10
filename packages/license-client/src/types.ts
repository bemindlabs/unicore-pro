// Types aligned with @unicore-license/license-types and openapi.yaml
// Duplicated here to avoid cross-repo dependency

export type LicenseEdition = 'community' | 'pro';

export interface FeatureFlags {
  allAgents: boolean;
  customAgentBuilder: boolean;
  fullRbac: boolean;
  advancedWorkflows: boolean;
  allChannels: boolean;
  unlimitedRag: boolean;
  whiteLabelBranding: boolean;
  sso: boolean;
  auditLogs: boolean;
  prioritySupport: boolean;
}

export interface ValidationResult {
  valid: boolean;
  edition: LicenseEdition;
  features: FeatureFlags;
  expiresAt: string;
  cacheUntil: string;
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
  agentsActive: number;
  rolesAssigned: number;
  channelsActive: number;
  workflowsCount: number;
  timestamp: string;
}
