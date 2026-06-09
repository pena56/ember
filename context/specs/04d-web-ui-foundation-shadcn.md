# Unit 04d: Web UI foundation — shadcn/ui + Sonner (apps/web)

Issue: #38 · Branch: feat/38-web-ui-foundation-shadcn · Boundary: apps/web
Route: standard (UI foundation) — single boundary (apps/web). New deps (shadcn brings cva/clsx/
tailwind-merge/tw-animate-css/sonner/lucide-react/Radix) would score the dep-signal high, but it is one
coherent CLI-managed install with no open product questions → standard, with **review focused on the
token-mapping seam** (the one real risk). Not a `frontend-design` greenfield unit — it sets up the
foundation + retrofits 04b's two notices; `impeccable` does a light pass on the retrofitted surface.

Emerged during 04b review (user direction 2026-06-09): adopt shadcn/ui as the web component
foundation; handroll only where shadcn has no good fit. Recorded in `ui-context.md` "Component Library"
(supersedes the 2026-06-08 "bespoke, no UI kit" decision) + the styling memory. Mobile is untouched
(shadcn is Radix/web-only — `apps/mobile` stays bespoke uniwind).

## Goal
Stand up shadcn/ui in `apps/web` themed entirely from the existing Amber Ember tokens (no hardcoded
palette — invariant #6), with dark mode driven by the current `data-app-theme` attribute. Add Button,
Card, and Sonner (toast). Retrofit Unit 04b so import feedback is Sonner toasts (not inline banners) and
the primary action uses shadcn `Button` — which folds in 04b review nit N1 (the `text-white` hardcode).
Done = the Library screen looks/behaves the same (or better), themes correctly in light **and** dark, and
all static gates stay green.

## Design   (light pass — impeccable on the retrofitted surface, not a redesign)
- **No visual regression** to the 04b Library. Toasts replace the inline notice; copy keeps the warm,
  gentle voice ("Added to your library", "Already in your library", "That's not a PDF" — Sonner
  `description` for detail). Position bottom-right (web convention), `richColors` off (we theme it).
- shadcn primitives must read as Amber Ember, not default shadcn slate: the var mapping (below) is the
  whole design surface. Accent buttons use the ember accent; focus rings use `--ring` → accent.
- Sonner `<Toaster>` inherits app theme via the existing provider (pass `theme` from `useTheme` resolved
  value, or `theme="system"` + our attribute — see Implementation).

## Implementation

### shadcn init + Tailwind v4 wiring
- From `apps/web`: `pnpm dlx shadcn@latest init` (existing-project mode). Accept defaults except theming
  (we override vars below). It will: add `components.json`, install deps, and touch the CSS entry.
- **Path alias** `@/* → ./src/*`: add to `apps/web/tsconfig.app.json` (`baseUrl`+`paths`) AND the Vite
  resolve alias in `apps/web/vite.config.ts` (`@types/node` for `path`/`__dirname`). Keep the existing
  `@ember/*` workspace aliases intact — `@/*` is web-internal only.
- Tailwind v4: CSS entry stays `src/styles.css` with `@import "tailwindcss";` then
  `@import "tw-animate-css";` then the existing `@import` of `@ember/tokens/theme.css`. Confirm
  `components.json` `tailwind.css` points at `src/styles.css` and `cssVariables: true`.
- Animations: **`tw-animate-css`** (Tailwind v4 successor to `tailwindcss-animate`) — let the CLI add it;
  do NOT add `tailwindcss-animate`.

### Token mapping — the core of this unit (`src/styles.css`)
- shadcn reads semantic CSS vars (`--background`, `--foreground`, `--card`, `--card-foreground`,
  `--popover*`, `--primary`, `--primary-foreground`, `--secondary*`, `--muted`, `--muted-foreground`,
  `--accent`, `--accent-foreground`, `--border`, `--input`, `--ring`, `--radius`, destructive*).
  **Map each to an Amber Ember token**, do not let shadcn write a slate palette. Define them by
  *referencing the token vars* `@ember/tokens` already exposes (e.g. `--primary: var(--color-accent)`,
  `--background: var(--color-surface)`, `--card: var(--color-surface-raised)`, `--foreground:
  var(--color-text)`, `--muted-foreground: var(--color-text-muted)`, `--border: var(--color-line)`,
  `--ring: var(--color-accent)`, `--primary-foreground:` an on-accent value — resolves N1). Verify the
  exact token var names against `packages/tokens/src/theme.css` before writing; if an on-accent token is
  missing, add `--color-on-accent` to `packages/tokens` (TS source + theme.css + theme.uniwind.css +
  extend the parity test) as a **separate small commit within this unit's PR**, clearly labelled — that is
  the one allowed `packages/tokens` change (it IS N1's proper fix).
- **Dark mode via `data-app-theme`, not `.dark`:** shadcn/Tailwind v4 default dark variant keys off
  `.dark`. Override so it follows our attribute: declare
  `@custom-variant dark (&:where([data-app-theme="warm-dark"], [data-app-theme="warm-dark"] *));` and put
  the dark var values under `[data-app-theme="warm-dark"]` (mapped to the dark token values). The existing
  `ThemeProvider` already sets `data-app-theme` on `<html>` — no provider change needed. Confirm `dark:`
  utilities and shadcn surfaces flip with the existing theme control.
- Tokens stay the single source of truth; shadcn vars are a thin *alias layer* over them — adding/altering
  a brand color still happens once in `packages/tokens`.

### Primitives (generated into `src/components/ui/`)
- `pnpm dlx shadcn@latest add button card sonner`. These are vendored (copied-in) components.
- **Lint:** generated `src/components/ui/**` will trip our strict flat-config (import-x/order, naming,
  react-refresh, etc.). Add an ESLint override for `apps/web/src/components/ui/**` that relaxes the
  authored-code rules for vendored shadcn primitives (keep them out of `filename-case`/naming churn) —
  our own code stays strict. Do NOT loosen rules globally.
- Sonner: mount `<Toaster />` once near the app root (in `App.tsx` or `main.tsx`, inside providers). Wire
  its `theme` to the app theme (e.g. read resolved theme from `useTheme()` and pass `theme={resolved ===
  'warm-dark' ? 'dark' : 'light'}`), so toasts match light/dark.

### Retrofit Unit 04b (incremental migration — only these two swaps)
- `src/library/use-library.ts` + `library-page.tsx`: drop the inline `notice` state/banner; call Sonner
  `toast.success('Added to your library')` / `toast('Already in your library')` /
  `toast.error('That's not a PDF', …)` from the import flow. Remove the now-dead notice UI + its test
  assertions, replacing them with toast assertions (mock `sonner`'s `toast` in the jsdom test and assert
  it's called with the right message per branch).
- `src/library/import-dropzone.tsx`: replace the hand-rolled `bg-accent text-white` button with shadcn
  `<Button>` (default/primary variant) — kills the `text-white` hardcode (N1). Keep the drag-drop zone
  itself bespoke (no clean shadcn equivalent); it may sit inside a shadcn `Card`.
- `document-row.tsx`: OPTIONAL — may wrap rows in shadcn `Card`; not required this pass (incremental).
  Do not rebuild the list. No behavior change to import/dedupe/persistence logic.

### Tests
- Update `library-page.test.tsx`: mock `sonner` (`vi.mock('sonner')`), assert `toast.*` fires per branch
  (added / deduped / rejected) instead of asserting inline-notice DOM. Row-count + empty-state assertions
  stay. The injected memory-store pattern is unchanged.
- A tiny `theme-vars` sanity test is optional (jsdom can't compute resolved CSS vars reliably) — prefer to
  cover dark-mode mapping in the browser-verify step instead.

## Dependencies
- Added by `shadcn@latest init/add` (let the CLI resolve + pin exact versions into `apps/web/package.json`
  — do not hand-pin from memory): `sonner`, `lucide-react`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `tw-animate-css`, and the Radix primitives the chosen components need; `@types/node`
  (dev, for the Vite alias). After init run `pnpm install` at the repo root so the lockfile updates.
- No change to `packages/core`/`packages/store`. The only `packages/tokens` change permitted is adding
  `--color-on-accent` (N1) if no on-accent token exists — separate labelled commit.

## Verify when done
- [ ] Library screen renders unchanged-or-better; import via drag-drop AND picker still works; dedupe +
      OPFS/Dexie persistence behavior identical to 04b (logic untouched).
- [ ] Import feedback is Sonner toasts (added / deduped / rejected), warm voice; no inline notice banner
      remains.
- [ ] shadcn `Button`/`Card`/`Toaster` are themed from Amber Ember tokens (no default slate); the
      `text-white` hardcode (N1) is gone — primary button text comes from a token (`--primary-foreground`).
- [ ] Dark mode: toggling the theme control flips shadcn surfaces + toasts via `data-app-theme` (no
      reliance on a `.dark` class). Light and dark both correct.
- [ ] `@/*` alias resolves in tsconfig + Vite; `@ember/*` workspace aliases still resolve.
- [ ] Generated `src/components/ui/**` is lint-scoped (override), authored code stays strict.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (library-page test now asserts Sonner calls)
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated — esp. #6 (shadcn vars alias tokens; palette still single-sourced in
      `packages/tokens`); core/store untouched; mobile untouched.
- [ ] **BROWSER-VERIFY (user):** `pnpm --filter @ember/web dev` → import a PDF → success toast; re-import
      → dedupe toast; drop a non-PDF → error toast; toggle System/Light/Dark → shadcn Button/Card + toasts
      all re-theme correctly; keyboard focus shows the accent ring.
```
