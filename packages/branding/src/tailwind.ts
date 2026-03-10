// Tailwind CSS theme integration helper for @unicore/branding
// Converts a BrandingConfig into a Tailwind `theme.extend` compatible object.

import type { BrandingConfig } from './types';

export interface TailwindColorScale {
  DEFAULT: string;
  hsl?: string;
}

export interface TailwindThemeExtension {
  colors: {
    brand: {
      primary: TailwindColorScale;
      secondary: TailwindColorScale;
      accent: TailwindColorScale;
      background: TailwindColorScale;
      surface: TailwindColorScale;
      foreground: TailwindColorScale;
      muted: TailwindColorScale;
      border: TailwindColorScale;
      destructive: TailwindColorScale;
      'on-primary': TailwindColorScale;
    };
  };
  fontFamily: {
    body?: string[];
    heading?: string[];
    mono?: string[];
  };
}

/**
 * Convert a BrandingConfig into a Tailwind `theme.extend` object.
 *
 * Usage in tailwind.config.ts:
 * ```ts
 * import { brandingToTailwindTheme } from '@unicore/branding';
 * import { loadBrandingConfig } from '@unicore/branding';
 *
 * const branding = await loadBrandingConfig();
 *
 * export default {
 *   theme: {
 *     extend: brandingToTailwindTheme(branding),
 *   },
 * };
 * ```
 *
 * Or use CSS variable references so the theme updates at runtime:
 * ```ts
 * export default {
 *   theme: {
 *     extend: brandingToCssVarTailwindTheme(),
 *   },
 * };
 * ```
 */
export function brandingToTailwindTheme(
  config: BrandingConfig,
): TailwindThemeExtension {
  const c = config.colors;

  function scale(value: string | undefined, fallback = 'transparent'): TailwindColorScale {
    return { DEFAULT: value ?? fallback };
  }

  const fontFamily: TailwindThemeExtension['fontFamily'] = {};
  if (config.bodyFont) {
    fontFamily['body'] = [config.bodyFont.family, 'ui-sans-serif', 'sans-serif'];
  }
  const headingFont = config.headingFont ?? config.bodyFont;
  if (headingFont) {
    fontFamily['heading'] = [headingFont.family, 'ui-sans-serif', 'sans-serif'];
  }
  if (config.monoFont) {
    fontFamily['mono'] = [config.monoFont.family, 'ui-monospace', 'monospace'];
  }

  return {
    colors: {
      brand: {
        primary: scale(c.primary),
        secondary: scale(c.secondary),
        accent: scale(c.accent),
        background: scale(c.background),
        surface: scale(c.surface),
        foreground: scale(c.foreground),
        muted: scale(c.muted),
        border: scale(c.border),
        destructive: scale(c.destructive),
        'on-primary': scale(c.onPrimary),
      },
    },
    fontFamily,
  };
}

/**
 * Generate a Tailwind theme extension that uses CSS variable references.
 * This enables runtime theme switching without rebuilding Tailwind.
 *
 * Colors are referenced as `var(--color-primary)` etc., so they update
 * automatically when the CSS variables change (e.g. from BrandingProvider).
 */
export function brandingToCssVarTailwindTheme(): TailwindThemeExtension {
  function cssVar(varName: string): TailwindColorScale {
    return { DEFAULT: `var(${varName})` };
  }

  return {
    colors: {
      brand: {
        primary: cssVar('--color-primary'),
        secondary: cssVar('--color-secondary'),
        accent: cssVar('--color-accent'),
        background: cssVar('--color-background'),
        surface: cssVar('--color-surface'),
        foreground: cssVar('--color-foreground'),
        muted: cssVar('--color-muted'),
        border: cssVar('--color-border'),
        destructive: cssVar('--color-destructive'),
        'on-primary': cssVar('--color-on-primary'),
      },
    },
    fontFamily: {
      body: ['var(--font-body)', 'ui-sans-serif', 'sans-serif'],
      heading: ['var(--font-heading)', 'ui-sans-serif', 'sans-serif'],
      mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
    },
  };
}
