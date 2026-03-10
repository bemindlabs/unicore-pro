// BrandingProvider — React context for dashboard consumption
// This file is intentionally a .tsx to support JSX; it has no runtime React
// dependency in Node.js-only contexts as long as JSX transform is configured.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
  type FC,
} from 'react';

import type { BrandingConfig, BrandingConfigPatch } from './types';
import type { BrandingService } from './service';
import { generateCssVariables } from './css-generator';
import { getDefaultConfig } from './presets';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface BrandingContextValue {
  /** Current resolved branding config */
  config: BrandingConfig;
  /** Whether the config is being loaded from storage */
  loading: boolean;
  /** Last error from load/save, if any */
  error: Error | null;
  /** Apply a partial patch and persist */
  updateBranding: (patch: BrandingConfigPatch) => Promise<void>;
  /** Reset to defaults and persist */
  resetBranding: () => Promise<void>;
  /** Apply a named preset (ID from BRANDING_PRESETS) */
  applyPreset: (presetId: string) => Promise<void>;
  /** Toggle the removeUnicoreBranding flag */
  setRemoveUnicoreBranding: (enabled: boolean) => Promise<void>;
  /** Reload config from storage (e.g. after an external update) */
  reload: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

const BrandingContext = createContext<BrandingContextValue | null>(null);
BrandingContext.displayName = 'BrandingContext';

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export interface BrandingProviderProps {
  /** The BrandingService instance to use. Inject from server or instantiate here. */
  service: BrandingService;
  /**
   * Optional initial config to avoid a loading flash (e.g. pass from SSR).
   * If provided, the provider won't load from the service until `reload()` is called.
   */
  initialConfig?: BrandingConfig;
  /** Whether to automatically inject CSS variables into document.documentElement */
  injectCssVariables?: boolean;
  children: ReactNode;
}

export const BrandingProvider: FC<BrandingProviderProps> = ({
  service,
  initialConfig,
  injectCssVariables = true,
  children,
}) => {
  const [config, setConfig] = useState<BrandingConfig>(
    initialConfig ?? getDefaultConfig(),
  );
  const [loading, setLoading] = useState<boolean>(!initialConfig);
  const [error, setError] = useState<Error | null>(null);

  // Inject CSS variables into the DOM root element
  const applyCssVars = useCallback((cfg: BrandingConfig) => {
    if (typeof document === 'undefined') return;
    const vars = generateCssVariables(cfg);
    for (const [prop, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(prop, value);
    }
    // Toggle branding attribute on document root
    if (cfg.removeUnicoreBranding) {
      document.documentElement.setAttribute('data-white-label', '1');
    } else {
      document.documentElement.removeAttribute('data-white-label');
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      service.invalidateCache();
      const loaded = await service.load();
      setConfig(loaded);
      if (injectCssVariables) applyCssVars(loaded);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [service, injectCssVariables, applyCssVars]);

  // Initial load (skip if initialConfig provided)
  useEffect(() => {
    if (!initialConfig) {
      void loadConfig();
    } else if (injectCssVariables) {
      applyCssVars(initialConfig);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBranding = useCallback(
    async (patch: BrandingConfigPatch) => {
      setError(null);
      try {
        const updated = await service.patch(patch);
        setConfig(updated);
        if (injectCssVariables) applyCssVars(updated);
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [service, injectCssVariables, applyCssVars],
  );

  const resetBranding = useCallback(async () => {
    setError(null);
    try {
      const reset = await service.reset();
      setConfig(reset);
      if (injectCssVariables) applyCssVars(reset);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [service, injectCssVariables, applyCssVars]);

  const applyPreset = useCallback(
    async (presetId: string) => {
      setError(null);
      try {
        const updated = await service.applyPreset(presetId);
        setConfig(updated);
        if (injectCssVariables) applyCssVars(updated);
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [service, injectCssVariables, applyCssVars],
  );

  const setRemoveUnicoreBranding = useCallback(
    async (enabled: boolean) => {
      setError(null);
      try {
        const updated = await service.setRemoveUnicoreBranding(enabled);
        setConfig(updated);
        if (injectCssVariables) applyCssVars(updated);
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [service, injectCssVariables, applyCssVars],
  );

  const contextValue: BrandingContextValue = {
    config,
    loading,
    error,
    updateBranding,
    resetBranding,
    applyPreset,
    setRemoveUnicoreBranding,
    reload: loadConfig,
  };

  return (
    <BrandingContext.Provider value={contextValue}>
      {children}
    </BrandingContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/**
 * Access the full branding context.
 * Must be used inside a <BrandingProvider>.
 */
export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error('useBranding must be used inside a <BrandingProvider>');
  }
  return ctx;
}

/**
 * Convenience hook — returns only the current BrandingConfig.
 */
export function useBrandingConfig(): BrandingConfig {
  return useBranding().config;
}

/**
 * Returns true if UniCore branding should be hidden.
 * Safe to call outside a provider (returns false in that case).
 */
export function useIsWhiteLabel(): boolean {
  const ctx = useContext(BrandingContext);
  return ctx?.config.removeUnicoreBranding ?? false;
}
