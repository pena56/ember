# Progress Tracker
Update after every meaningful change.

## Current Phase
- Units 02 (tokens, #2) + 02b (web theming, #19) MERGED to main. 02c (tokens→uniwind, #22)
  built + reviewed + fixed / awaiting commit+PR. Then 02d (mobile theming).

## Unit 02c build notes (2026-06-08)
- Done (packages/tokens): added `theme.uniwind.css` (uniwind `@theme` + `@layer theme{:root{
  @variant light/dark}}` form) authored from the same TS source; widened `--font-serif` to
  `'Fraunces Variable', 'Fraunces', serif` in both CSS files; added `./theme.uniwind.css` export.
- Built (Sonnet, TDD) → fresh-context review (Opus) = APPROVE-WITH-NITS → applied the SHOULD-FIX:
  parity test now extracts each `@variant` block body and asserts warm-light/warm-dark values live
  INSIDE the correct block (was a whole-file `.toContain`, which the @theme defaults masked).
- Tokens tests 23 ✓ · web 10 ✓ · typecheck/lint ✓. Invariant #6 intact (single TS source, both
  CSS reps parity-tested).

## Current Goal
- Active issue: #22 (Unit 02c — tokens: uniwind theme representation + variable Fraunces,
  `packages/tokens`; spec specs/02c-tokens-uniwind.md, branch feat/22-tokens-uniwind).
- Theming split (original "tokens + theming" was multi-boundary): 02 tokens ✓ → 02b web ✓ →
  **02c tokens/uniwind** (this) → **02d mobile theming** (next). uniwind switches themes via its
  JS runtime + `@variant` (not the web's `[data-app-theme]` selectors), so it needs its own
  parity-tested theme CSS authored from the one TS source. Backlog lives in GitHub Issues (repo
  pena56/ember); Unit NN ⇄ Issue #NN ⇄ feat/NN-… ⇄ specs/NN-….md.

## Completed
- (scaffolding) Context files generated from grill-me planning + look/feel session.
- Stack chosen and versions pinned (architecture.md, verified 2026-06-08).
- Build plan drafted (specs/00-build-plan.md, units 01–17).
- **Unit 01 done** (2026-06-08): pnpm + Turborepo monorepo scaffold on branch
  `feat/01-monorepo-tooling-scaffold`. Spec: specs/01-monorepo-tooling-scaffold.md.
  Built (Sonnet) → fresh-context review (Opus) found 2 blockers + 2 should-fixes → fixed → re-verified.
  All verify commands green AND now cover convex:
  `pnpm -w typecheck` ✓ (8 tasks, incl. @ember/convex) · `pnpm -w test` ✓ · `pnpm -w lint` ✓ (6 tasks, incl. @ember/convex).
  ESLint flat config enforces kebab-case filenames, PascalCase no-I-prefix types, import-x/order;
  apps/mobile extends eslint-config-expo, convex/ uses @convex-dev/eslint-plugin (both wired into Turbo).
  Decision recorded in architecture.md: eslint-plugin-import → eslint-plugin-import-x@4.16.2 (v2 incompatible with ESLint 10).
  Convex hand-scaffolded as workspace member @ember/convex (schema.ts empty defineSchema, package.json, convex.json,
  tsconfig.json); user must run `npx convex dev` once to provision deployment and generate `convex/_generated`.

## Next Up
- **Unit 02d — Mobile theming** (`apps/mobile`): uniwind + Metro (`withUniwindConfig`,
  `cssEntryFile: src/global.css` importing `tailwindcss` + `uniwind` + `@ember/tokens/theme.uniwind.css`),
  theme provider using `Uniwind.setTheme`/`useUniwind` (system/light/dark) persisted via
  AsyncStorage, fonts via `@expo-google-fonts/fraunces`+`inter`, themed chrome. Depends on 02c (#22).
  Open new issue when specced. Reader-theme switching on mobile deferred to reader unit 05.
- Manual follow-up: run `npx convex dev` from repo root to provision the Convex dev
  deployment and generate `convex/_generated`.

## uniwind research (2026-06-08, for 02c/02d — verified from docs.uniwind.dev)
- metro: `withUniwindConfig(getDefaultConfig(__dirname), { cssEntryFile, extraThemes, dtsFile })`.
  No babel preset. Restart with `expo start --clear`.
- global.css: `@import 'tailwindcss'; @import 'uniwind';` then theme fragment.
- Theming: token names in `@theme` (utility generation) + per-theme values in
  `@layer theme { :root { @variant light {} @variant dark {} } }`. Built-in themes light/dark/system.
- Runtime: `Uniwind.setTheme('light'|'dark'|'system')`, `Uniwind.currentTheme`,
  `useUniwind() → { theme, hasAdaptiveThemes }`. `dark:` variant for classes.
- className works on RN core components (View/Text); wrap 3rd-party with `withUniwind(Comp)`.

## Unit 02 build notes (2026-06-08)
- Done: `@ember/tokens` emits Amber Ember tokens twice — typed TS (`src/index.ts`) + Tailwind v4
  `@theme` fragment (`src/theme.css`, exported as `@ember/tokens/theme.css`). Parity test guards
  TS↔CSS drift across BOTH app themes + reader themes. No new deps. All verify green.
- Built (Sonnet, TDD) → fresh-context review (Opus) = APPROVE-WITH-NITS; applied both SHOULD-FIX
  inline: reader colors moved into `@theme` (so `bg-reader-bg`/`text-reader-text` utilities
  generate; selector blocks override sepia/night), parity test extended to warm-dark + reader.
- Carry-forward for 02b/02c: `theme.css` is a fragment with NO `@import "tailwindcss"` — clients
  MUST import it after their own Tailwind entry. Reader colors default to paper in `@theme`.

## Unit 02b build notes (2026-06-08)
- Done (apps/web): `@tailwindcss/vite` + `@import "tailwindcss"` then `@ember/tokens/theme.css`;
  ThemeProvider (`system`/light/dark, default system, persisted, FOUC inline script in index.html
  matching the provider's resolution rule); self-hosted Fraunces+Inter via @fontsource; minimal
  themed shell + segmented theme control; jsdom + RTL tests (10).
- Built (Sonnet, TDD) → impeccable polish (fixed broken `rounded-radius-md`→`rounded-md`, added
  focus-visible rings, redesigned active state token-purely) → fresh-context review (Opus) =
  CHANGES-REQUESTED → fixed: **BLOCKER** font family mismatch (`@fontsource-variable/fraunces`
  registers `'Fraunces Variable'` ≠ token `'Fraunces'` → swapped to non-variable
  `@fontsource/fraunces@5.2.9`); wordmark `text-accent`→`text-text` (warm-light accent-on-surface
  was 2.95:1, below AA large-text). All verify green + web build OK.
- **Token follow-up (defer to tokens pkg / before 02c):** to use the *variable* Fraunces (optical
  sizing, the documented design intent), widen `--font-serif` to `'Fraunces Variable', 'Fraunces',
  serif` in theme.css so both the variable and static packages resolve. Out of 02b's boundary.

## Open Questions (resolve before/at the relevant unit)
- **Mobile text-layer extraction** (unit 05): react-native-pdf's text-layer story is weaker than
  pdf.js. Confirm approach — native text extraction, a pdf.js-in-webview path on mobile, or a
  hybrid. Affects highlight anchoring parity across clients.
- **Convex auth provider** (unit 11): which sign-in method(s) — email link, OAuth (Google/Apple)?
- **Quota numbers** (unit 13): confirm defaults (e.g. 2GB/user, 100MB/file) and monetization path.
- **Web reader leaf decisions**: font/scroll polish — safe to decide during build.

## Resolved decisions (2026-06-08, grill-me — promoted to ui-context.md / architecture.md)
- **Components:** bespoke token-driven per client; styling via Tailwind v4 (`@tailwindcss/vite`
  web) + uniwind (mobile). Tokens authored once as Tailwind v4 `@theme`.
- **Fonts:** Fraunces (serif/headings/streak numbers) + Inter (sans/body/UI).
- **Palette "Amber Ember":** accent `#E0701B`; warm-light surface `#FAF4EA`/text `#2A2422`;
  warm-dark surface `#1C1815`/text `#F2E9DB`; reader paper/sepia/night defined in ui-context.md.
- **Deploy:** trunk-based, tag-gated prod. Web→Cloudflare Pages, Convex→staging+tag-prod,
  Mobile→EAS Update OTA (native build/submit deferred). Secrets per architecture.md Deployment.

## Architecture Decisions (durable — promoted to architecture.md invariants)
- On-device store is source of truth; Convex is sync server, never on read path.
- HLC for ordering; SHA-256 for document identity; sessions are an immutable derived-from log.
- Conflict rules: furthest-page (overridable), union annotations/tags, additive sessions.
- Anonymous-local → account claim processed as a merge event.
- Hybrid notifications de-duplicated via primary-device election + delivery ledger.
- Shared `packages/core` (pure TS) + `Repository` store abstraction (SQLite/Dexie).
- Lint/format: official configs (typescript-eslint base + eslint-config-expo for mobile +
  react-hooks/jsx-a11y for web), Prettier. Conventions: kebab-case files & dirs, PascalCase
  types (no `I`-prefix), grouped/ordered imports via `@ember/*` aliases — all enforced in the
  flat config wired in unit 01 (see code-standards.md + architecture.md Tooling).

## Session Notes
- Project root: `C:\Users\MOSES\Documents\personal\ember`.
- Design fully specified across architecture.md / ui-context.md; resume by picking the next
  build-plan unit and running `spec-unit`.
