# Unit 02c: Tokens — uniwind theme representation + variable Fraunces

Issue: #22 · Branch: feat/22-tokens-uniwind · Boundary: `packages/tokens`
Route: standard — one boundary, no new deps, values come from the existing TS source of truth.
Prerequisite for Unit 02d (mobile theming).

## Goal
Add a uniwind-consumable theme stylesheet (`src/theme.uniwind.css`) so the mobile client can
theme-switch via uniwind's runtime, authored from the SAME values as the existing TS object and
web `theme.css` (invariant #6 — defined once). Also widen the serif font stack to restore the
variable Fraunces. Extend the parity test to guard the new file.

## Background (why a second CSS file)
uniwind (Tailwind v4 for RN) has no DOM, so it cannot use the web file's `[data-app-theme]`
selectors. It generates utilities from `@theme` and switches themes at runtime (`Uniwind.setTheme`)
using values declared under `@variant <theme>` blocks. Verified from uniwind docs. The values are
identical to web; only the switching mechanism differs — hence a per-runtime CSS representation,
both fed from the one TS source and parity-tested.

## Implementation
Values are the source of truth in `src/index.ts` (`themes`, `readerThemes`, `ember`, `radii`,
`fonts`) — read them there; do not invent. Use lowercase hex to match.

### `src/theme.uniwind.css` (new)
A fragment (NO `@import "tailwindcss"`/`"uniwind"` — those live in the mobile global.css, Unit 02d):
```css
/* @ember/tokens — uniwind (Tailwind v4 for RN) theme fragment.
   Import AFTER `@import "tailwindcss"; @import "uniwind";` in the app's global.css. */

/* Token names → utilities (defaults = warm-light). */
@theme {
  --color-accent:      #e0701b;
  --color-accent-dark: #f2913e;
  --color-streak-lit:  #f59e0b;
  --color-streak-risk: #b98a5e;
  --color-surface:        #faf4ea;
  --color-surface-raised: #fffdf9;
  --color-text:           #2a2422;
  --color-text-muted:     #6f665c;
  --color-line:           #e7ddcb;
  --color-reader-bg:   #fbf6ec;   /* default reader = paper; per-reader-theme switching is unit 05 */
  --color-reader-text: #2a2422;
  --font-serif: 'Fraunces Variable', 'Fraunces', serif;
  --font-sans:  'Inter', sans-serif;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 24px;
}

/* Per-theme values for runtime switching (Uniwind.setTheme('light'|'dark'|'system')). */
@layer theme {
  :root {
    @variant light {
      --color-surface: #faf4ea; --color-surface-raised: #fffdf9;
      --color-text: #2a2422; --color-text-muted: #6f665c;
      --color-line: #e7ddcb; --color-accent: #e0701b;
    }
    @variant dark {
      --color-surface: #1c1815; --color-surface-raised: #272220;
      --color-text: #f2e9db; --color-text-muted: #a89c8c;
      --color-line: #38312b; --color-accent: #f2913e;
    }
  }
}
```
The light `@variant` values must equal `themes['warm-light']`; dark must equal `themes['warm-dark']`
(plus `ember` accents and reader defaults from `readerThemes.paper`). Uniwind maps its built-in
`light`/`dark` themes to these; no `extraThemes` needed for app chrome.

### `src/theme.css` (edit — variable Fraunces)
Change `--font-serif` from `'Fraunces', serif` to `'Fraunces Variable', 'Fraunces', serif`.
Backward-compatible: web's non-variable `@fontsource/fraunces` still matches the `'Fraunces'`
fallback; a future variable load matches `'Fraunces Variable'` first.

### `package.json` (edit)
Add export `"./theme.uniwind.css": "./src/theme.uniwind.css"` alongside `.` and `./theme.css`.

### `src/tests/index.test.ts` (extend)
Add a uniwind-parity block mirroring the existing CSS-parity tests, importing
`../theme.uniwind.css?raw`:
- every `themes['warm-light']`, `themes['warm-dark']`, `readerThemes.paper`, and `ember` value
  appears in the uniwind CSS;
- the file declares `@variant light` and `@variant dark` blocks;
- `--color-*` names present in `@theme` (incl. `--color-reader-bg`/`--color-reader-text`);
- `--font-serif` in BOTH `theme.css` and `theme.uniwind.css` contains `Fraunces Variable`.

## Dependencies
- none. (`tailwindcss`/`uniwind` are the mobile app's deps, added in Unit 02d.)

## Verify when done
- [ ] `theme.uniwind.css` exists, exported as `@ember/tokens/theme.uniwind.css`, with `@theme` +
      `@variant light/dark` carrying the exact warm-light/warm-dark values.
- [ ] Uniwind-parity test passes (values match the TS source; no drift).
- [ ] `--font-serif` includes `Fraunces Variable` in both CSS files; web parity test still green.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] Invariant #6 honoured — values authored once (TS), both CSS representations parity-tested;
      no hardcoded duplication that isn't guarded.

## Note for Unit 02d (mobile)
Runtime validation that utilities generate and themes switch happens in the mobile app (uniwind +
Metro can't run inside this package). If uniwind needs a minor structural tweak to this file,
that's an expected small follow-up to this unit, not a mobile-boundary change.
