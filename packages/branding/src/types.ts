// @unicore/branding — White-label customization types

export type FontWeight = 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

export interface BrandingFont {
  /** Font family name (e.g. "Inter", "Roboto") */
  family: string;
  /** URL to load the font (e.g. Google Fonts URL or self-hosted). Optional if system font. */
  url?: string;
  /** Weights to load */
  weights?: FontWeight[];
}

export interface BrandingColors {
  /** Primary brand color — used for buttons, links, highlights. Hex, RGB, or HSL. */
  primary: string;
  /** Secondary brand color — used for secondary buttons and accents. */
  secondary: string;
  /** Accent color — used for notifications, badges, highlights. */
  accent: string;
  /** Background color for the main content area. */
  background?: string;
  /** Surface color for cards, panels, and elevated elements. */
  surface?: string;
  /** Text color on primary-colored backgrounds. */
  onPrimary?: string;
  /** Default foreground / text color. */
  foreground?: string;
  /** Muted text color for secondary labels. */
  muted?: string;
  /** Border color. */
  border?: string;
  /** Destructive / error state color. */
  destructive?: string;
}

export interface BrandingConfig {
  /** Application name shown in the dashboard title bar, emails, etc. */
  appName: string;
  /** URL to the main logo image (SVG or PNG recommended). */
  logoUrl?: string;
  /** URL to a compact / icon-only logo for sidebar collapsed state. */
  logoIconUrl?: string;
  /** URL to the favicon (ICO, PNG, or SVG). */
  faviconUrl?: string;
  /** Color palette */
  colors: BrandingColors;
  /** Primary body font */
  bodyFont?: BrandingFont;
  /** Display / heading font. Falls back to bodyFont if not set. */
  headingFont?: BrandingFont;
  /** Mono / code font */
  monoFont?: BrandingFont;
  /**
   * When true, all UniCore-specific branding (name, logo, "Powered by" footer)
   * is removed from the UI. Requires whiteLabelBranding license feature.
   */
  removeUnicoreBranding: boolean;
  /** Custom CSS to inject after generated theme variables. */
  customCss?: string;
  /** ISO timestamp of when this config was last saved */
  updatedAt?: string;
}

/** A named preset theme */
export interface BrandingPreset {
  id: string;
  name: string;
  description?: string;
  config: Omit<BrandingConfig, 'appName' | 'removeUnicoreBranding' | 'updatedAt'>;
}

/** Minimal override shape for partial updates */
export type BrandingConfigPatch = Partial<Omit<BrandingConfig, 'colors'>> & {
  colors?: Partial<BrandingColors>;
};

/** Options for CSS variable generation */
export interface CssGeneratorOptions {
  /** CSS selector to scope variables under. Defaults to ":root" */
  selector?: string;
  /** Whether to emit @font-face / @import rules for custom fonts. Defaults to true */
  includeFontImports?: boolean;
  /** Whether to append customCss at the end. Defaults to true */
  includeCustomCss?: boolean;
}
