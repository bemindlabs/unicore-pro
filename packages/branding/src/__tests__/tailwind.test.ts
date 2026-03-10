import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { brandingToTailwindTheme, brandingToCssVarTailwindTheme } from '../tailwind';
import { getDefaultConfig } from '../presets';

describe('brandingToTailwindTheme', () => {
  it('maps primary/secondary/accent colors to brand.* keys', () => {
    const config = getDefaultConfig();
    const theme = brandingToTailwindTheme(config);

    assert.equal(theme.colors.brand.primary.DEFAULT, config.colors.primary);
    assert.equal(theme.colors.brand.secondary.DEFAULT, config.colors.secondary);
    assert.equal(theme.colors.brand.accent.DEFAULT, config.colors.accent);
  });

  it('maps optional colors with fallback to transparent', () => {
    const config = {
      ...getDefaultConfig(),
      colors: {
        primary: '#6366f1',
        secondary: '#10b981',
        accent: '#f59e0b',
        // intentionally omit optional colors
      },
    };
    const theme = brandingToTailwindTheme(config);
    assert.equal(theme.colors.brand.background.DEFAULT, 'transparent');
    assert.equal(theme.colors.brand.surface.DEFAULT, 'transparent');
  });

  it('includes fontFamily.body when bodyFont is set', () => {
    const config = {
      ...getDefaultConfig(),
      bodyFont: { family: 'Inter' },
    };
    const theme = brandingToTailwindTheme(config);
    assert.ok(theme.fontFamily['body']);
    assert.ok(theme.fontFamily['body']!.includes('Inter'));
  });

  it('heading font falls back to body font when headingFont not set', () => {
    const config = {
      ...getDefaultConfig(),
      bodyFont: { family: 'Roboto' },
    };
    const theme = brandingToTailwindTheme(config);
    assert.ok(theme.fontFamily['heading']!.includes('Roboto'));
  });

  it('uses headingFont over bodyFont when both set', () => {
    const config = {
      ...getDefaultConfig(),
      bodyFont: { family: 'Roboto' },
      headingFont: { family: 'Playfair Display' },
    };
    const theme = brandingToTailwindTheme(config);
    assert.ok(theme.fontFamily['heading']!.includes('Playfair Display'));
    assert.ok(!theme.fontFamily['heading']!.includes('Roboto'));
  });

  it('includes monoFont when configured', () => {
    const config = {
      ...getDefaultConfig(),
      monoFont: { family: 'JetBrains Mono' },
    };
    const theme = brandingToTailwindTheme(config);
    assert.ok(theme.fontFamily['mono']!.includes('JetBrains Mono'));
  });
});

describe('brandingToCssVarTailwindTheme', () => {
  it('returns CSS variable references for all brand colors', () => {
    const theme = brandingToCssVarTailwindTheme();

    assert.equal(theme.colors.brand.primary.DEFAULT, 'var(--color-primary)');
    assert.equal(theme.colors.brand.secondary.DEFAULT, 'var(--color-secondary)');
    assert.equal(theme.colors.brand.accent.DEFAULT, 'var(--color-accent)');
    assert.equal(theme.colors.brand.background.DEFAULT, 'var(--color-background)');
    assert.equal(theme.colors.brand.destructive.DEFAULT, 'var(--color-destructive)');
  });

  it('returns CSS variable references for font families', () => {
    const theme = brandingToCssVarTailwindTheme();

    assert.ok(theme.fontFamily['body']!.includes('var(--font-body)'));
    assert.ok(theme.fontFamily['heading']!.includes('var(--font-heading)'));
    assert.ok(theme.fontFamily['mono']!.includes('var(--font-mono)'));
  });
});
