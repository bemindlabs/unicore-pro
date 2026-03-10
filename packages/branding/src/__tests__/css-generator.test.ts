import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateCssTheme, generateCssVariables } from '../css-generator';
import { getDefaultConfig } from '../presets';
import type { BrandingConfig } from '../types';

function makeConfig(overrides?: Partial<BrandingConfig>): BrandingConfig {
  return {
    ...getDefaultConfig('TestApp'),
    ...overrides,
  };
}

describe('generateCssVariables', () => {
  it('returns color variables for all defined colors', () => {
    const config = makeConfig();
    const vars = generateCssVariables(config);

    assert.ok('--color-primary' in vars);
    assert.ok('--color-secondary' in vars);
    assert.ok('--color-accent' in vars);
    assert.equal(vars['--color-primary'], config.colors.primary);
  });

  it('includes --app-name and --remove-unicore-branding', () => {
    const config = makeConfig({ appName: 'AcmeDash', removeUnicoreBranding: true });
    const vars = generateCssVariables(config);

    assert.equal(vars['--app-name'], 'AcmeDash');
    assert.equal(vars['--remove-unicore-branding'], '1');
  });

  it('returns 0 for removeUnicoreBranding when false', () => {
    const config = makeConfig({ removeUnicoreBranding: false });
    const vars = generateCssVariables(config);
    assert.equal(vars['--remove-unicore-branding'], '0');
  });

  it('includes font variables when fonts are configured', () => {
    const config = makeConfig({
      bodyFont: { family: 'Inter', weights: ['regular', 'medium', 'bold'] },
      monoFont: { family: 'JetBrains Mono' },
    });
    const vars = generateCssVariables(config);

    assert.match(vars['--font-body']!, /Inter/);
    assert.match(vars['--font-heading']!, /Inter/); // heading falls back to body
    assert.match(vars['--font-mono']!, /JetBrains Mono/);
  });

  it('uses separate heading font when configured', () => {
    const config = makeConfig({
      bodyFont: { family: 'Inter' },
      headingFont: { family: 'Playfair Display' },
    });
    const vars = generateCssVariables(config);
    assert.match(vars['--font-body']!, /Inter/);
    assert.match(vars['--font-heading']!, /Playfair Display/);
  });
});

describe('generateCssTheme', () => {
  it('wraps variables in :root by default', () => {
    const config = makeConfig();
    const css = generateCssTheme(config);
    assert.ok(css.includes(':root {'));
    assert.ok(css.includes('--color-primary'));
  });

  it('uses custom selector when provided', () => {
    const config = makeConfig();
    const css = generateCssTheme(config, { selector: '.my-theme' });
    assert.ok(css.includes('.my-theme {'));
    assert.ok(!css.includes(':root {'));
  });

  it('emits Google Fonts @import for fonts without custom URL', () => {
    const config = makeConfig({
      bodyFont: { family: 'Inter', weights: ['regular', 'bold'] },
    });
    const css = generateCssTheme(config, { includeFontImports: true });
    assert.match(css, /fonts\.googleapis\.com/);
    assert.match(css, /Inter/);
  });

  it('emits @import for font with CSS URL', () => {
    const config = makeConfig({
      bodyFont: {
        family: 'CustomFont',
        url: 'https://fonts.example.com/custom.css',
      },
    });
    const css = generateCssTheme(config, { includeFontImports: true });
    assert.match(css, /@import url\('https:\/\/fonts\.example\.com\/custom\.css'\)/);
  });

  it('skips font imports when includeFontImports is false', () => {
    const config = makeConfig({
      bodyFont: { family: 'Inter' },
    });
    const css = generateCssTheme(config, { includeFontImports: false });
    assert.ok(!css.includes('fonts.googleapis.com'));
  });

  it('hides [data-unicore-branding] when removeUnicoreBranding is true', () => {
    const config = makeConfig({ removeUnicoreBranding: true });
    const css = generateCssTheme(config);
    assert.match(css, /\[data-unicore-branding\]/);
    assert.match(css, /display: none/);
  });

  it('does not hide UniCore branding elements when flag is false', () => {
    const config = makeConfig({ removeUnicoreBranding: false });
    const css = generateCssTheme(config);
    assert.ok(!css.includes('[data-unicore-branding]'));
  });

  it('appends customCss when includeCustomCss is true', () => {
    const config = makeConfig({ customCss: '.hero { color: red; }' });
    const css = generateCssTheme(config, { includeCustomCss: true });
    assert.match(css, /\.hero \{ color: red; \}/);
  });

  it('omits customCss when includeCustomCss is false', () => {
    const config = makeConfig({ customCss: '.hero { color: red; }' });
    const css = generateCssTheme(config, { includeCustomCss: false });
    assert.ok(!css.includes('.hero { color: red; }'));
  });

  it('emits HSL companion variables for hex colors', () => {
    const config = makeConfig({
      colors: {
        primary: '#6366f1',
        secondary: '#10b981',
        accent: '#f59e0b',
      },
    });
    const css = generateCssTheme(config);
    assert.match(css, /--color-primary-hsl:/);
  });
});
