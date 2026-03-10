// Default theme presets for @unicore/branding

import type { BrandingPreset } from './types';

export const DEFAULT_PRESET_ID = 'unicore-default';

export const BRANDING_PRESETS: readonly BrandingPreset[] = [
  {
    id: 'unicore-default',
    name: 'UniCore Default',
    description: 'The standard UniCore indigo / emerald palette.',
    config: {
      colors: {
        primary: '#6366f1',    // indigo-500
        secondary: '#10b981',  // emerald-500
        accent: '#f59e0b',     // amber-500
        background: '#0f172a', // slate-900
        surface: '#1e293b',    // slate-800
        onPrimary: '#ffffff',
        foreground: '#f1f5f9', // slate-100
        muted: '#94a3b8',      // slate-400
        border: '#334155',     // slate-700
        destructive: '#ef4444',
      },
    },
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    description: 'Deep navy tones for a professional enterprise look.',
    config: {
      colors: {
        primary: '#3b82f6',    // blue-500
        secondary: '#6366f1',  // indigo-500
        accent: '#8b5cf6',     // violet-500
        background: '#0a0f1e',
        surface: '#111827',
        onPrimary: '#ffffff',
        foreground: '#e2e8f0',
        muted: '#64748b',
        border: '#1e3a5f',
        destructive: '#f87171',
      },
    },
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    description: 'Warm rose and gold tones for lifestyle and creative brands.',
    config: {
      colors: {
        primary: '#f43f5e',    // rose-500
        secondary: '#fb923c',  // orange-400
        accent: '#fbbf24',     // amber-400
        background: '#1c0a0e',
        surface: '#2d1117',
        onPrimary: '#ffffff',
        foreground: '#fce7f3',
        muted: '#9f1239',
        border: '#4c0519',
        destructive: '#dc2626',
      },
    },
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    description: 'Natural greens for sustainability and eco-focused brands.',
    config: {
      colors: {
        primary: '#16a34a',    // green-600
        secondary: '#0891b2',  // cyan-600
        accent: '#84cc16',     // lime-400
        background: '#0a1a0e',
        surface: '#14532d',
        onPrimary: '#ffffff',
        foreground: '#dcfce7',
        muted: '#4ade80',
        border: '#166534',
        destructive: '#dc2626',
      },
    },
  },
  {
    id: 'slate-light',
    name: 'Slate Light',
    description: 'Clean, light mode palette for modern SaaS products.',
    config: {
      colors: {
        primary: '#6366f1',    // indigo-500
        secondary: '#0ea5e9',  // sky-500
        accent: '#f59e0b',     // amber-500
        background: '#f8fafc', // slate-50
        surface: '#ffffff',
        onPrimary: '#ffffff',
        foreground: '#0f172a', // slate-900
        muted: '#64748b',      // slate-500
        border: '#e2e8f0',     // slate-200
        destructive: '#ef4444',
      },
    },
  },
] as const;

/**
 * Look up a preset by ID. Returns undefined if not found.
 */
export function findPreset(id: string): BrandingPreset | undefined {
  return BRANDING_PRESETS.find((p) => p.id === id);
}

/**
 * Return the default UniCore preset config merged with the given appName and flags.
 */
export function getDefaultConfig(appName = 'UniCore'): import('./types').BrandingConfig {
  const preset = findPreset(DEFAULT_PRESET_ID)!;
  return {
    appName,
    colors: { ...preset.config.colors },
    removeUnicoreBranding: false,
    updatedAt: new Date().toISOString(),
  };
}
