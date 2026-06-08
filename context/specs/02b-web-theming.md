# Unit 02b: Web theming

Issue: #19 · Branch: feat/19-web-theming · Boundary: `apps/web`
Route: standard — one boundary; design fully resolved; the only new deps are official,
already-chosen (Tailwind 4.3.0 per architecture). Follow-on to #2 (tokens).

## Goal
Wire Tailwind v4 + the `@ember/tokens` `@theme` into `apps/web`, add an app theme provider
(`system | warm-light | warm-dark`, default `system`, persisted, no flash on load), self-host
Fraunces + Inter, and render a **minimal themed shell** that proves token utilities
(`bg-surface`, `text-text`, `bg-accent`, `font-serif`/`font-sans`) and live theme switching work.

## Design
Minimal foundation shell only — real Today/Library/Stats screens are units 06+. Run `impeccable`
on the shell for token-fidelity / a11y / visual correctness; do NOT run `frontend-design` (the
output would be a throwaway screen). Honour `ui-context.md`: warm-light/warm-dark only here
(reader themes excluded), Fraunces for the wordmark/heading, Inter for body/UI, accent `#e0701b`.
- Shell content: centered `Ember` wordmark in `font-serif`, one line of `font-sans` body copy,
  and a **theme control** (segmented or cycling button) switching system/light/dark. Surface uses
  `bg-surface text-text`; the control's active state uses `bg-accent`. No hardcoded colors — only
  token utilities (invariant #6).
- All colors/fonts/radii come from the `@ember/tokens` utilities — never raw hex in components.

## Implementation
### Tailwind v4 wiring
- `vite.config.ts`: add `@tailwindcss/vite` plugin (alongside existing `react()` + `VitePWA`).
- `src/styles.css` (new): `@import "tailwindcss";` then on the **next line**
  `@import "@ember/tokens/theme.css";` — tokens AFTER tailwind (the fragment's documented
  load-order contract; it has no `@import "tailwindcss"` of its own).
- Import `./styles.css` at the top of `src/main.tsx`.

### Fonts (self-hosted via @fontsource)
- Import `@fontsource-variable/fraunces` and `@fontsource/inter` (e.g. in `src/main.tsx` or
  `styles.css`). The `@theme` already names `--font-serif: 'Fraunces'` / `--font-sans: 'Inter'`;
  these imports supply the actual woff2. Verify the family names match the `@theme` declarations.

### Theme provider
- `src/theme/resolve-app-theme.ts` (pure): `resolveAppTheme(pref: ThemePreference,
  systemPrefersDark: boolean): AppThemeName`. `system` → dark/light by the boolean; explicit
  preference passes through. `ThemePreference = 'system' | AppThemeName` (reuse `AppThemeName`
  from `@ember/tokens`).
- `src/theme/theme-provider.tsx`: context exposing `{ preference, resolvedTheme, setPreference }`.
  - Read initial preference from `localStorage['ember-app-theme']`, default `'system'`.
  - Track system via `window.matchMedia('(prefers-color-scheme: dark)')` + a change listener
    (clean up on unmount).
  - On resolved-theme change, set `document.documentElement.dataset.appTheme = resolvedTheme`
    (always an explicit `'warm-light'`/`'warm-dark'`, never unset, so it matches the CSS selector).
  - `setPreference` persists to `localStorage` and updates state.
- `src/theme/use-theme.ts`: `useTheme()` hook reading the context (throw if used outside provider).
- Wrap `<App />` in `<ThemeProvider>` in `main.tsx`.

### FOUC guard
- In `index.html`, add a small inline `<script>` in `<head>` (before the module script) that reads
  `localStorage['ember-app-theme']` + `prefers-color-scheme` and sets `data-app-theme` on
  `<html>` synchronously, so the correct theme paints on first frame.

### Themed shell
- Replace `src/App.tsx`'s placeholder with the minimal themed shell + theme control described in
  Design, using `useTheme()` to drive the control.

### Test setup
- `apps/web/vitest.config.ts` (new): `test.environment = 'jsdom'`, `globals: true`.
- `src/tests/`:
  - `resolve-app-theme.test.ts`: pure-function cases (system+dark→warm-dark, system+light→
    warm-light, explicit passthrough for both).
  - `theme-provider.test.tsx`: render with `@testing-library/react`; assert default resolves from
    a mocked `matchMedia`, that `setPreference('warm-dark')` sets
    `document.documentElement.dataset.appTheme === 'warm-dark'` and writes `localStorage`.
- Keep/replace the existing trivial `app.test.ts`.

## Dependencies
Install just-in-time; pin the exact version printed by the registry at install time.
- `@tailwindcss/vite@4.3.0` + `tailwindcss@4.3.0` (dev) — Tailwind v4 Vite plugin (matches architecture pin).
- `@fontsource-variable/fraunces@5.2.9` + `@fontsource/inter@5.2.8` (deps) — self-hosted fonts.
- `jsdom@29.1.1` + `@testing-library/react@16.3.2` (dev) — DOM env + provider tests.
  (`@testing-library/jest-dom` optional — only if the executor wants its matchers.)

## Verify when done
- [ ] `pnpm --filter @ember/web dev` renders the themed shell; toggling the control switches
      warm-light↔warm-dark live and the choice survives reload (no flash on load).
- [ ] `data-app-theme` is set on `<html>` to an explicit `warm-light`/`warm-dark`; `system` tracks
      `prefers-color-scheme`.
- [ ] Token utilities resolve (e.g. `bg-surface`/`bg-accent` reflect the Amber Ember palette);
      no raw hex in `apps/web` components.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (pure + provider tests)
- [ ] `pnpm -w lint` clean
- [ ] Invariant #6 honoured — only `@ember/tokens` values consumed; tokens not redefined in the client.
