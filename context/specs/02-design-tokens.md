# Unit 02: Design Tokens (source of truth)

Issue: #2 · Branch: feat/2-design-tokens · Boundary: `packages/tokens`
Route: standard — one boundary, design fully resolved, no new deps. (Split out of original
multi-boundary "tokens + theming"; client wiring is follow-on units 02b-web / 02c-mobile.)

## Goal
Author the Amber Ember semantic tokens once in `packages/tokens`, emitted in **two parity-checked
forms**: (1) a Tailwind v4 `@theme` stylesheet (`src/theme.css`) both clients import, and (2) a
typed TS object (`src/index.ts`) for non-CSS consumers (RN raw values, GoalRing/Ember canvas,
Reanimated). No client wiring, no fonts loaded, no components — only the token package.

## Design
Values are already resolved in `ui-context.md`; reproduce them exactly — do not invent shades.

- **Ember accent (theme-independent):** `accent #E0701B`, `accentDark #F2913E`,
  `streakLit #F59E0B`, `streakRisk #B98A5E`.
- **App themes** (`warm-light` / `warm-dark`): `surface #FAF4EA / #1C1815` ·
  `surfaceRaised #FFFDF9 / #272220` · `text #2A2422 / #F2E9DB` · `textMuted #6F665C / #A89C8C` ·
  `line #E7DDCB / #38312B` · `accent #E0701B / #F2913E`.
- **Reader themes** (`paper` / `sepia` / `night`, chosen independently of app chrome):
  bg/text = `#FBF6EC / #2A2422` · `#F2E5CC / #4A3F2F` · `#14110E / #C9BEAD`.
- **Fonts** (family names only — actual loading is 02b/02c): serif `Fraunces`, sans `Inter`.
- **Radii** (cozy/soft): `sm 8px` · `md 12px` · `lg 16px` · `xl 24px`.
- **Spacing:** keep Tailwind's built-in scale — do NOT redefine it. Only colors/fonts/radii are
  custom `@theme` additions. (Using Tailwind spacing utilities still satisfies invariant #6.)

## Implementation
### `src/theme.css` — Tailwind v4 `@theme`
- `@theme { … }` declares the **default (warm-light)** semantic vars so Tailwind generates
  `bg-surface`, `bg-surface-raised`, `text-text`, `text-text-muted`, `border-line`, `bg-accent`,
  etc. Naming: nested roles use dash (`--color-surface-raised`, `--color-text-muted`). Also
  `--color-streak-lit`, `--color-streak-risk`, `--color-accent-dark`, `--font-serif`,
  `--font-sans`, `--radius-sm|md|lg|xl`.
- **Dark override:** re-assign the same `--color-*` custom properties to warm-dark values under
  both `:root[data-app-theme='warm-dark']` and `.warm-dark` (clients pick the selector in
  02b/02c — ship both so either works).
- **Reader themes:** `--color-reader-bg` / `--color-reader-text` defined per
  `[data-reader-theme='paper'|'sepia'|'night']` (and matching `.paper`/`.sepia`/`.night`).
- No `@import "tailwindcss"` here — this file is a fragment clients import after their own
  Tailwind entry. Keep it pure `@theme` + selector overrides so it stays toolchain-light.

### `src/index.ts` — typed token object
Replace the placeholder. Export, mirroring the CSS exactly:
```ts
export type AppThemeName = 'warm-light' | 'warm-dark';
export type ReaderThemeName = 'paper' | 'sepia' | 'night';
export const ember = { accent, accentDark, streakLit, streakRisk } as const;
export const fonts = { serif: 'Fraunces', sans: 'Inter' } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 24 } as const; // px
export const themes: Record<AppThemeName, { surface; surfaceRaised; text; textMuted; line; accent }>;
export const readerThemes: Record<ReaderThemeName, { bg: string; text: string }>;
```
Keep the existing `TOKENS_VERSION` export (bump to `'0.1.0'`). Hex values lowercase or as in
`ui-context.md` — be consistent; the parity test enforces match with the CSS.

### `package.json` exports
Add a `./theme.css` export pointing at `./src/theme.css` alongside the existing `.` export so
clients can `import '@ember/tokens/theme.css'`.

### `src/tests/index.test.ts`
- Update the `TOKENS_VERSION` assertion to `'0.1.0'`.
- Assert `themes['warm-light'].surface === '#FAF4EA'` and one warm-dark value (spot-check the
  table was transcribed correctly).
- **Parity test:** read `src/theme.css` as text; assert every color in `themes['warm-light']`
  and every `ember` value appears as a `--color-*: <hex>` declaration. This is the guard against
  the two artifacts drifting.

## Dependencies
- none — no new npm packages. (`tailwindcss` is NOT a dependency of this package; `theme.css` is
  a shipped CSS fragment. Tailwind/uniwind live in the client units 02b/02c.)

## Verify when done
- [ ] `@ember/tokens` exports `themes`, `readerThemes`, `ember`, `fonts`, `radii`, type names;
      `theme.css` exists and is importable via `@ember/tokens/theme.css`.
- [ ] Parity test passes — TS values and CSS `--color-*` declarations match (no drift).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean (kebab-case files, PascalCase types, ordered imports)
- [ ] Invariant #6 honoured: tokens defined once, semantic, consumed by both clients — no client
      wiring or hardcoded values introduced in this unit.
