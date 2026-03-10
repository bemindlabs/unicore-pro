import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CachedValidation, ValidationResult } from './types';

const CACHE_DIR = join(homedir(), '.unicore');
const CACHE_FILE = join(CACHE_DIR, 'license-cache.json');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class LicenseCache {
  private readonly cacheDurationMs: number;
  private readonly offlineGracePeriodMs: number;
  private readonly cacheFilePath: string;

  constructor(options?: {
    cacheDurationMs?: number;
    offlineGracePeriodMs?: number;
    cacheFilePath?: string;
  }) {
    this.cacheDurationMs = options?.cacheDurationMs ?? SEVEN_DAYS_MS;
    this.offlineGracePeriodMs = options?.offlineGracePeriodMs ?? THIRTY_DAYS_MS;
    this.cacheFilePath = options?.cacheFilePath ?? CACHE_FILE;
  }

  get(licenseKey: string): ValidationResult | null {
    const cached = this.readCache(licenseKey);
    if (!cached) return null;

    if (this.isCacheValid(cached)) {
      return cached.result;
    }

    return null;
  }

  getWithGracePeriod(licenseKey: string): ValidationResult | null {
    const cached = this.readCache(licenseKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age < this.offlineGracePeriodMs) {
      return cached.result;
    }

    return null;
  }

  set(licenseKey: string, result: ValidationResult): void {
    const allCaches = this.readAllCaches();
    allCaches[licenseKey] = {
      result,
      timestamp: Date.now(),
      cacheUntil: result.cacheUntil,
    };
    this.writeCaches(allCaches);
  }

  clear(licenseKey?: string): void {
    if (licenseKey) {
      const allCaches = this.readAllCaches();
      delete allCaches[licenseKey];
      this.writeCaches(allCaches);
    } else {
      this.writeCaches({});
    }
  }

  private isCacheValid(cached: CachedValidation): boolean {
    // Honor server-provided cacheUntil
    if (cached.cacheUntil) {
      return new Date(cached.cacheUntil).getTime() > Date.now();
    }

    // Fall back to configured cache duration
    const age = Date.now() - cached.timestamp;
    return age < this.cacheDurationMs;
  }

  private readCache(licenseKey: string): CachedValidation | null {
    const allCaches = this.readAllCaches();
    return allCaches[licenseKey] ?? null;
  }

  private readAllCaches(): Record<string, CachedValidation> {
    try {
      const data = readFileSync(this.cacheFilePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private writeCaches(caches: Record<string, CachedValidation>): void {
    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(this.cacheFilePath, JSON.stringify(caches, null, 2), 'utf-8');
    } catch {
      // Silently fail if we can't write cache (e.g., read-only filesystem)
    }
  }
}
