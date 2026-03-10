// @unicore/branding — White-label customization
// Public API surface

// Types
export type {
  BrandingConfig,
  BrandingConfigPatch,
  BrandingColors,
  BrandingFont,
  BrandingPreset,
  CssGeneratorOptions,
  FontWeight,
  TailwindColorScale,
  TailwindThemeExtension,
} from './types';

export type {
  TailwindColorScale as TwColorScale,
  TailwindThemeExtension as TwThemeExtension,
} from './tailwind';

// Service & storage
export {
  BrandingService,
  MemoryBrandingStorage,
  FileBrandingStorage,
} from './service';
export type { BrandingStorage, BrandingServiceOptions } from './service';

// CSS generator
export { generateCssTheme, generateCssVariables } from './css-generator';

// Tailwind integration
export { brandingToTailwindTheme, brandingToCssVarTailwindTheme } from './tailwind';

// Presets
export {
  BRANDING_PRESETS,
  DEFAULT_PRESET_ID,
  findPreset,
  getDefaultConfig,
} from './presets';

// React provider & hooks (tree-shaken in non-React environments)
export {
  BrandingProvider,
  useBranding,
  useBrandingConfig,
  useIsWhiteLabel,
} from './provider';
export type { BrandingContextValue, BrandingProviderProps } from './provider';
