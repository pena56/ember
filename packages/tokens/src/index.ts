// packages/tokens — shared design tokens (semantic colors, spacing, typography)

export const TOKENS_VERSION = '0.1.0';

// ── Type names ────────────────────────────────────────────────────────────────

export type AppThemeName = 'warm-light' | 'warm-dark';
export type ReaderThemeName = 'paper' | 'sepia' | 'night';

// ── Ember accent (theme-independent) ─────────────────────────────────────────

export const ember = {
  accent: '#e0701b',
  accentDark: '#f2913e',
  /** Text on top of the accent color (e.g. primary button label). Dark ink, not white:
   *  white on the amber accent is ~3.2:1 (light) / ~2.4:1 (dark) — fails AA. Resolves N1. */
  onAccent: '#2a2422',
  streakLit: '#f59e0b',
  streakRisk: '#b98a5e',
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const fonts = {
  serif: 'Fraunces',
  sans: 'Inter',
} as const;

// ── Radii (px) ────────────────────────────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

// ── App themes ────────────────────────────────────────────────────────────────

export const themes: Record<
  AppThemeName,
  {
    surface: string;
    surfaceRaised: string;
    text: string;
    textMuted: string;
    line: string;
    accent: string;
  }
> = {
  'warm-light': {
    surface: '#faf4ea',
    surfaceRaised: '#fffdf9',
    text: '#2a2422',
    textMuted: '#6f665c',
    line: '#e7ddcb',
    accent: '#e0701b',
  },
  'warm-dark': {
    surface: '#1c1815',
    surfaceRaised: '#272220',
    text: '#f2e9db',
    textMuted: '#a89c8c',
    line: '#38312b',
    accent: '#f2913e',
  },
} as const;

// ── Reader themes ─────────────────────────────────────────────────────────────

export const readerThemes: Record<ReaderThemeName, { bg: string; text: string }> = {
  paper: { bg: '#fbf6ec', text: '#2a2422' },
  sepia: { bg: '#f2e5cc', text: '#4a3f2f' },
  night: { bg: '#14110e', text: '#c9bead' },
} as const;

// ── Highlight colors (theme-independent) ──────────────────────────────────────
// Keys match the HighlightColor union in @ember/core annotation model.
// Single-sourced here; both CSS files declare the same values as --color-highlight-*.

export const highlights = {
  yellow: '#f4d06f',
  green:  '#9fc08a',
  blue:   '#93b7d4',
  pink:   '#e3a7be',
} as const;
