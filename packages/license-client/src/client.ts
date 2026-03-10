import type {
  LicenseClientOptions,
  ValidationResult,
  FeatureFlags,
  AnalyticsReport,
} from './types';
import { LicenseCache } from './cache';
import { collectFingerprint } from './fingerprint';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export class LicenseClient {
  private readonly licenseKey: string;
  private readonly serverUrl: string;
  private readonly cache: LicenseCache;
  private lastValidation: ValidationResult | null = null;

  constructor(options: LicenseClientOptions) {
    if (!options.licenseKey || !options.serverUrl) {
      throw new Error('licenseKey and serverUrl are required');
    }

    this.licenseKey = options.licenseKey;
    this.serverUrl = options.serverUrl.replace(/\/+$/, '');
    this.cache = new LicenseCache({
      cacheDurationMs: options.cacheDurationMs ?? SEVEN_DAYS_MS,
      offlineGracePeriodMs: options.offlineGracePeriodMs ?? THIRTY_DAYS_MS,
      cacheFilePath: options.cacheFilePath,
    });
  }

  async validate(): Promise<ValidationResult> {
    // Check cache first
    const cached = this.cache.get(this.licenseKey);
    if (cached) {
      this.lastValidation = cached;
      return cached;
    }

    // Attempt server validation
    try {
      const result = await this.serverValidate();
      this.lastValidation = result;
      this.cache.set(this.licenseKey, result);
      return result;
    } catch (error) {
      // Fall back to grace period cache on network failure
      const graceResult = this.cache.getWithGracePeriod(this.licenseKey);
      if (graceResult) {
        this.lastValidation = graceResult;
        return graceResult;
      }
      throw error;
    }
  }

  async getFeatures(): Promise<FeatureFlags> {
    const result = await this.fetchWithRetry<FeatureFlags>(
      `${this.serverUrl}/api/v1/features/${encodeURIComponent(this.licenseKey)}`,
      { method: 'GET' },
    );
    return result;
  }

  async isFeatureEnabled(feature: keyof FeatureFlags): Promise<boolean> {
    const features = await this.getFeatures();
    return !!features[feature];
  }

  getCachedValidation(): ValidationResult | null {
    if (this.lastValidation) return this.lastValidation;
    return this.cache.getWithGracePeriod(this.licenseKey);
  }

  async refresh(): Promise<ValidationResult> {
    this.cache.clear(this.licenseKey);
    this.lastValidation = null;

    const result = await this.serverValidate();
    this.lastValidation = result;
    this.cache.set(this.licenseKey, result);
    return result;
  }

  async reportAnalytics(
    report: Omit<AnalyticsReport, 'licenseKey' | 'timestamp'>,
  ): Promise<void> {
    const fullReport: AnalyticsReport = {
      ...report,
      licenseKey: this.licenseKey,
      timestamp: new Date().toISOString(),
    };

    await this.fetchWithRetry<void>(
      `${this.serverUrl}/api/v1/analytics`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullReport),
      },
    );
  }

  private async serverValidate(): Promise<ValidationResult> {
    const machineFingerprint = collectFingerprint();

    return this.fetchWithRetry<ValidationResult>(
      `${this.serverUrl}/api/v1/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: this.licenseKey,
          machineFingerprint,
        }),
      },
    );
  }

  private async fetchWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            ...init.headers as Record<string, string>,
            'User-Agent': '@unicore/license-client',
          },
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`License server error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`);
        }

        // For 204 No Content responses (e.g., analytics)
        if (response.status === 204) {
          return undefined as T;
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (lastError.message.includes('License server error: 4')) {
          throw lastError;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
