import { describe, expect, it } from 'vitest';

import {
  TOKENS_VERSION,
  ember,
  fonts,
  highlights,
  radii,
  readerThemes,
  themes,
} from '../index.js';
import themeCss from '../theme.css?raw';
import themeUniwndCss from '../theme.uniwind.css?raw';

describe('@ember/tokens', () => {
  it('exports TOKENS_VERSION 0.1.0', () => {
    expect(TOKENS_VERSION).toBe('0.1.0');
  });

  describe('ember accent tokens', () => {
    it('exports ember accent colors', () => {
      expect(ember.accent).toBe('#e0701b');
      expect(ember.accentDark).toBe('#f2913e');
      expect(ember.onAccent).toBe('#2a2422');
      expect(ember.streakLit).toBe('#f59e0b');
      expect(ember.streakRisk).toBe('#b98a5e');
    });
  });

  describe('fonts', () => {
    it('exports font family names', () => {
      expect(fonts.serif).toBe('Fraunces');
      expect(fonts.sans).toBe('Inter');
    });
  });

  describe('radii', () => {
    it('exports radius values in px', () => {
      expect(radii.sm).toBe(8);
      expect(radii.md).toBe(12);
      expect(radii.lg).toBe(16);
      expect(radii.xl).toBe(24);
    });
  });

  describe('themes', () => {
    it('warm-light surface is #faf4ea', () => {
      expect(themes['warm-light'].surface).toBe('#faf4ea');
    });

    it('warm-light has all required keys', () => {
      const wl = themes['warm-light'];
      expect(wl.surface).toBeDefined();
      expect(wl.surfaceRaised).toBeDefined();
      expect(wl.text).toBeDefined();
      expect(wl.textMuted).toBeDefined();
      expect(wl.line).toBeDefined();
      expect(wl.accent).toBeDefined();
    });

    it('warm-dark surface is #1c1815', () => {
      expect(themes['warm-dark'].surface).toBe('#1c1815');
    });

    it('warm-dark has all required keys', () => {
      const wd = themes['warm-dark'];
      expect(wd.surface).toBeDefined();
      expect(wd.surfaceRaised).toBeDefined();
      expect(wd.text).toBeDefined();
      expect(wd.textMuted).toBeDefined();
      expect(wd.line).toBeDefined();
      expect(wd.accent).toBeDefined();
    });
  });

  describe('readerThemes', () => {
    it('exports paper theme', () => {
      expect(readerThemes.paper.bg).toBe('#fbf6ec');
      expect(readerThemes.paper.text).toBe('#2a2422');
    });

    it('exports sepia theme', () => {
      expect(readerThemes.sepia.bg).toBe('#f2e5cc');
      expect(readerThemes.sepia.text).toBe('#4a3f2f');
    });

    it('exports night theme', () => {
      expect(readerThemes.night.bg).toBe('#14110e');
      expect(readerThemes.night.text).toBe('#c9bead');
    });
  });

  describe('highlights', () => {
    it('exports highlights with 4 keys matching HighlightColor union', () => {
      expect(highlights.yellow).toBe('#f4d06f');
      expect(highlights.green).toBe('#9fc08a');
      expect(highlights.blue).toBe('#93b7d4');
      expect(highlights.pink).toBe('#e3a7be');
    });

    it('every highlight hex appears in theme.css', () => {
      for (const [color, hex] of Object.entries(highlights)) {
        expect(themeCss, `Missing highlights.${color} value ${hex} in theme.css`).toContain(hex);
      }
    });

    it('every highlight hex appears in theme.uniwind.css', () => {
      for (const [color, hex] of Object.entries(highlights)) {
        expect(themeUniwndCss, `Missing highlights.${color} value ${hex} in theme.uniwind.css`).toContain(hex);
      }
    });

    it('--color-highlight-* property names declared in theme.css', () => {
      expect(themeCss).toMatch(/--color-highlight-yellow\s*:/);
      expect(themeCss).toMatch(/--color-highlight-green\s*:/);
      expect(themeCss).toMatch(/--color-highlight-blue\s*:/);
      expect(themeCss).toMatch(/--color-highlight-pink\s*:/);
    });

    it('--color-highlight-* property names declared in theme.uniwind.css', () => {
      expect(themeUniwndCss).toMatch(/--color-highlight-yellow\s*:/);
      expect(themeUniwndCss).toMatch(/--color-highlight-green\s*:/);
      expect(themeUniwndCss).toMatch(/--color-highlight-blue\s*:/);
      expect(themeUniwndCss).toMatch(/--color-highlight-pink\s*:/);
    });
  });

  describe('CSS parity', () => {
    const css = themeCss;

    it('every app-theme color (warm-light + warm-dark) appears in theme.css', () => {
      for (const [name, theme] of Object.entries(themes)) {
        for (const [role, hex] of Object.entries(theme)) {
          expect(css, `Missing ${name}.${role} value ${hex} in theme.css`).toContain(hex);
        }
      }
    });

    it('every reader-theme color (paper/sepia/night) appears in theme.css', () => {
      for (const [name, theme] of Object.entries(readerThemes)) {
        expect(css, `Missing reader ${name}.bg ${theme.bg} in theme.css`).toContain(theme.bg);
        expect(css, `Missing reader ${name}.text ${theme.text} in theme.css`).toContain(
          theme.text,
        );
      }
    });

    it('every ember accent value appears in theme.css', () => {
      for (const [label, hex] of Object.entries(ember)) {
        expect(css, `Missing ember.${label} value ${hex} in theme.css`).toContain(hex);
      }
    });

    it('declares the expected --color-* property names', () => {
      expect(css).toMatch(/--color-surface\s*:/);
      expect(css).toMatch(/--color-surface-raised\s*:/);
      expect(css).toMatch(/--color-text\s*:/);
      expect(css).toMatch(/--color-text-muted\s*:/);
      expect(css).toMatch(/--color-line\s*:/);
      expect(css).toMatch(/--color-accent\s*:/);
      expect(css).toMatch(/--color-accent-dark\s*:/);
      expect(css).toMatch(/--color-on-accent\s*:/);
      expect(css).toMatch(/--color-streak-lit\s*:/);
      expect(css).toMatch(/--color-streak-risk\s*:/);
      // reader colors must live in @theme so utilities generate (not only in selector blocks)
      expect(css).toMatch(/--color-reader-bg\s*:/);
      expect(css).toMatch(/--color-reader-text\s*:/);
    });

    it('--font-serif in theme.css contains Fraunces Variable', () => {
      expect(css).toContain('Fraunces Variable');
    });
  });

  describe('uniwind CSS parity', () => {
    const css = themeUniwndCss;

    // Extract the body of an `@variant <name> { ... }` block so theme values are
    // asserted INSIDE their own block, not merely somewhere in the file (the
    // @theme defaults also carry warm-light values, which would mask a broken
    // @variant light block under a whole-file substring check).
    const variantBody = (name: string): string => {
      const match = new RegExp(`@variant\\s+${name}\\s*\\{([^}]*)\\}`).exec(css);
      expect(match, `Missing @variant ${name} block in theme.uniwind.css`).not.toBeNull();
      return match![1]!;
    };

    it('@variant light block carries exactly the warm-light values', () => {
      const body = variantBody('light');
      for (const [role, hex] of Object.entries(themes['warm-light'])) {
        expect(body, `@variant light missing warm-light.${role} value ${hex}`).toContain(hex);
      }
    });

    it('@variant dark block carries exactly the warm-dark values', () => {
      const body = variantBody('dark');
      for (const [role, hex] of Object.entries(themes['warm-dark'])) {
        expect(body, `@variant dark missing warm-dark.${role} value ${hex}`).toContain(hex);
      }
    });

    it('reader defaults (readerThemes.paper) appear in theme.uniwind.css', () => {
      expect(css, `Missing paper.bg in theme.uniwind.css`).toContain(readerThemes.paper.bg);
      expect(css, `Missing paper.text in theme.uniwind.css`).toContain(readerThemes.paper.text);
    });

    it('every ember accent value appears in theme.uniwind.css', () => {
      for (const [label, hex] of Object.entries(ember)) {
        expect(css, `Missing ember.${label} value ${hex} in theme.uniwind.css`).toContain(hex);
      }
    });

    it('declares @variant light and @variant dark blocks', () => {
      expect(css).toMatch(/@variant\s+light/);
      expect(css).toMatch(/@variant\s+dark/);
    });

    it('declares expected --color-* names inside @theme', () => {
      expect(css).toMatch(/--color-surface\s*:/);
      expect(css).toMatch(/--color-surface-raised\s*:/);
      expect(css).toMatch(/--color-text\s*:/);
      expect(css).toMatch(/--color-text-muted\s*:/);
      expect(css).toMatch(/--color-line\s*:/);
      expect(css).toMatch(/--color-accent\s*:/);
      expect(css).toMatch(/--color-accent-dark\s*:/);
      expect(css).toMatch(/--color-on-accent\s*:/);
      expect(css).toMatch(/--color-streak-lit\s*:/);
      expect(css).toMatch(/--color-streak-risk\s*:/);
      expect(css).toMatch(/--color-reader-bg\s*:/);
      expect(css).toMatch(/--color-reader-text\s*:/);
    });

    it('--font-serif in theme.uniwind.css contains Fraunces Variable', () => {
      expect(css).toContain('Fraunces Variable');
    });
  });
});
