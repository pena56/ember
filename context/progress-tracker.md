# Progress Tracker
Update after every meaningful change.

## Current Phase
- Theming epic COMPLETE: units 02 (#2), 02b (#19), 02c (#22), 02d (#24) all MERGED to main
  (#24 closed; commit+PR + device verification done). Store epic underway: 03a (#26), 03b (#29) MERGED.
- **Unit 03 (local store + HLC + outbox) scored COMPLEX → split** (2026-06-08). Build-plan unit 03
  crosses boundaries (core HLC/outbox + store Repository + two platform impls) → split into:
  **03a** core sync primitives + Repository interface (#26, this — specced) → **03b** Dexie/web
  impl → **03c** SQLite/mobile impl (device-bound like 02d). Spec: specs/03a-core-sync-primitives.md.
  Decisions (confirmed): generic record store (not domain-typed; entities land with units 04/07/10);
  shared `runRepositoryConformance` suite both impls run. Route 03a = standard (pure TS, no new dep).

## Unit 02d build notes (2026-06-08)
- Done (apps/mobile): uniwind + Metro (`metro.config.js` withUniwindConfig, `global.css` at app
  root importing tailwindcss+uniwind+`@ember/tokens/theme.uniwind.css`), `babel.config.js`
  (babel-preset-expo), theme provider (default system, `expo-sqlite/kv-store` persistence via
  `getItemSync` at init, `Uniwind.setTheme`), fonts via `@expo-google-fonts` registered under
  token-stack family names, themed shell + accessible segmented control (accent underline on
  raised surface). Pure `coerceStoredPreference` unit-tested (7 mobile tests).
- Built (Sonnet, TDD) → impeccable (redesigned the near-invisible active segment to match 02b's
  accent-underline a11y pattern) → fresh-context review (Opus) = APPROVE-WITH-NITS, NO blockers.
  Reviewer verified the hand-authored `src/uniwind-types.d.ts` is byte-identical to uniwind's
  generator output (Metro wasn't run — no simulator).
- typecheck 8 ✓ · test 5 tasks/42 ✓ · lint 6 ✓. No new async-storage dep (kv-store instead).
- **DEVICE-BOUND (user, before/after merge):** `npx expo start --clear` → confirm the generated
  uniwind d.ts matches the committed one; themed render + Fraunces/Inter apply; live light↔dark
  toggle + `system` follows device; persistence across reload. If `font-serif` doesn't resolve,
  adjust the family-name keys in `app/_layout.tsx`.
- **Bundler fixes (found on first device run; validated headlessly via `expo export -p android`
  → "Android Bundled … Exported: dist"):**
  1. **Metro `.js` resolution** — the repo authors relative imports with explicit `.js` (TS/NodeNext
     style; fine for tsc/Vite). Metro doesn't rewrite `.js`→`.tsx`, so it failed to resolve
     `../src/theme/theme-provider.js`. Fixed with a `resolver.resolveRequest` wrapper in
     `apps/mobile/metro.config.js` that strips `.js` and retries. **Carry-forward: any future RN
     relative import keeps the `.js` convention — Metro handles it via this resolver.**
  2. **reanimated 4 worklets** — `react-native-reanimated@4.4.1` (scaffolded in unit 01, first
     bundled now) needs `react-native-worklets` + its babel plugin. Installed
     `react-native-worklets@0.8.3` (via `expo install`) and added `react-native-worklets/plugin`
     (last) to `apps/mobile/babel.config.js`.
  - Also: expo tooling added `apps/mobile/.gitignore` (+`dist/`), expo-env.d.ts + .expo/types to
    tsconfig include (expo-env.d.ts gitignored, regenerated — not committed).
  3. **SDK-56 version alignment** — unit-01 pinned 6 mobile deps AHEAD of what Expo SDK 56
     supports (latent until first run). `expo install --fix` aligned them (now "up to date"):
     react/react-dom `19.2.7→19.2.3` (must match RN's react-native-renderer exactly),
     react-native-gesture-handler `3.0.0→~2.31.1` (major), react-native-reanimated `4.4.1→4.3.1`,
     react-native-safe-area-context `5.8.0→~5.7.0`, @types/react `19.1.8→~19.2.14`.
     **Lesson: pin Expo-managed native deps via `expo install`, not the bare npm registry —
     SDK 56 lags the latest. Web (Vite) React stays 19.2.7; only mobile is RN-locked to 19.2.3.**
  - After all fixes: `expo export -p android` → "Android Bundled … Exported: dist"; static
    checks typecheck 8 ✓ · test 5 ✓ · lint 6 ✓. Runtime visuals still device-bound (user).
  4. **uniwind className did nothing on device** (first visual run: no styling at all — flex/gap/
     colors/fonts all ignored, though `className` typechecks). Root cause: uniwind's runtime must be
     bootstrapped by **`import '../global.css'` in the root `app/_layout.tsx`** — the metro
     `cssEntryFile` config ALONE is not enough. **Carry-forward: always import the css entry in the
     app root.** Also hid the expo-router default header (`Stack screenOptions headerShown:false`).

## Unit 02c build notes (2026-06-08)
- Done (packages/tokens): added `theme.uniwind.css` (uniwind `@theme` + `@layer theme{:root{
  @variant light/dark}}` form) authored from the same TS source; widened `--font-serif` to
  `'Fraunces Variable', 'Fraunces', serif` in both CSS files; added `./theme.uniwind.css` export.
- Built (Sonnet, TDD) → fresh-context review (Opus) = APPROVE-WITH-NITS → applied the SHOULD-FIX:
  parity test now extracts each `@variant` block body and asserts warm-light/warm-dark values live
  INSIDE the correct block (was a whole-file `.toContain`, which the @theme defaults masked).
- Tokens tests 23 ✓ · web 10 ✓ · typecheck/lint ✓. Invariant #6 intact (single TS source, both
  CSS reps parity-tested).

## Unit 03a build notes (2026-06-08)
- Done: `@ember/core` HLC clock (`hlc.ts`: tick/receive/compare/encode/parse/initialClock — pure,
  caller passes physical time, no `Date.now()`) + append-only outbox (`outbox.ts`: OutboxEntry +
  `makeOutboxEntry` stamping encoded HLC, drops payload on delete; no uuid/crypto in core).
  `@ember/store` `Repository` interface (generic record store + outbox ops), `MemoryRepository`
  reference impl (structuredClone value isolation, hlc-sorted unacked, idempotent ack), and shared
  `runRepositoryConformance(label, makeRepo)` suite (03b/03c plug into it). encode is lexicographic
  & provably agrees with compare (WALL_PAD 15 ⇒ ~year 33658, COUNTER_PAD 8 — overflow out of scope).
- Built (Sonnet, TDD: core 23 tests, store conformance) → fresh-context review (Opus) =
  APPROVE-WITH-NITS, NO blockers/should-fix. Reviewer re-ran all gates + verified the store tsconfig
  change (composite:false/noEmit — mirrors apps/web+mobile) doesn't weaken typecheck or break
  03b/03c (all consumers resolve `@ember/*` to source via paths, nobody reads compiled d.ts).
  Applied 2 nits (wrong comment year; merged duplicate import).
- typecheck 8 ✓ · test 5 tasks ✓ · lint 6 ✓. No new dep. Invariants #1/#2 + core-purity intact.
- **tsconfig carry-forward:** `packages/store/tsconfig.json` now `composite:false`/`noEmit:true`,
  typecheck via `tsc --noEmit` — forced once store gained a cross-package `@ember/core` source
  import. Any future package importing another workspace package's source follows this pattern.

## Unit 03b build notes (2026-06-08)
- Done (packages/store): `DexieRepository` (Dexie 4.4.3 / IndexedDB) — single `records` table keyed
  by compound `[collection+id]` (+ `collection` index) + `outbox` table indexed on `hlc`;
  `structuredClone` on write AND read for value isolation; ctor takes db name (default `'ember'`)
  for test isolation; uses ambient global `indexedDB` (no fake-indexeddb import in impl). Headless
  tests via `fake-indexeddb@6.2.5` in vitest `setupFiles`; conformance run uses a unique UUID db
  name per `makeRepo`. `import { Dexie }` (named) + `import type { Table }` — NodeNext default-import
  gotcha. conformance.ts/repository.ts untouched; core gained no Dexie import.
- Built (Sonnet, TDD: 16 Dexie conformance + 16 Memory + 1 index = 33 ✓) → fresh-context review
  (Opus) = APPROVE-WITH-NITS, NO blockers. Reviewer independently re-ran all gates + confirmed
  core-purity + suite-untouched.
- typecheck 8 ✓ · test 5 tasks/33 ✓ · lint 6 ✓.
- **Follow-up (defer, against 03a's SHARED suite — its own micro-unit, don't weaken in 03b's PR):**
  `runRepositoryConformance` never calls `close()` (no afterEach), so `close()` is uncovered. Add
  an `afterEach(repo.close)` + an idempotent-close assertion to conformance.ts so 03b/03c both
  exercise it. NITs (no action — deliberately consistent w/ MemoryRepository): Dexie `enqueue`
  clones the entry while Memory doesn't; structuredClone shape constraint undocumented in contract.

## Unit 03c build notes (2026-06-09)
- Done (packages/store): tiny async `SqliteDriver` port (`sqlite-driver.ts`: exec/run/all/close +
  `SqlValue`); `SqliteRepository` (`sqlite-repository.ts`: private ctor + static async `create(driver)`
  that runs DDL; records & outbox stored as JSON text → value isolation via JSON.parse, no
  structuredClone; `INSERT OR REPLACE` upsert, `ORDER BY hlc ASC` == 03a encoded-HLC string sort under
  SQLite BINARY collation; idempotent `close()` guarded by a `closed` flag since DatabaseSync throws on
  double-close); `nodeSqliteDriver` (`node-sqlite-driver.ts`: wraps Node 24 built-in `node:sqlite`
  `DatabaseSync`, sync→async, `:memory:` default). Barrel exports port+repo+node driver but NOT the expo
  binding. Also bundled the deferred **close()-coverage micro-unit** into `conformance.ts`
  (`afterEach(close)` + idempotent-close test) — all 3 impls now exercise close().
- Done (apps/mobile): thin `expoSqliteDriver` adapter (`src/store/expo-sqlite-driver.ts`) over
  expo-sqlite async API (openDatabaseAsync/execAsync/runAsync/getAllAsync/closeAsync) — the ONLY file
  importing expo-sqlite. Added `@ember/store` workspace dep.
- Built (Sonnet, TDD: SqliteRepository runs the full shared suite via node:sqlite → store 52 tests =
  17×3 impls + 1 index) → fresh-context review (Opus) = **APPROVE-WITH-NITS**, NO blockers/should-fix.
  Reviewer re-ran all gates + verified suite not weakened, expo-sqlite/node:sqlite each imported in
  exactly one file, core untouched, HLC ordering sound. Applied 2 nits: pinned `@types/node` exact
  (25.9.2, house style) + commented the deliberate `types:["node"]` mobile-tsconfig trade-off.
- typecheck 9 ✓ · test 5 tasks/52 ✓ · lint 6 ✓. No new external dep (node:sqlite built-in;
  expo-sqlite already pinned). Invariants #1/#2 + core-purity intact.
- **BARREL FIX (found on first device bundle — spec was wrong):** the public barrel must NOT
  re-export test-only modules. Metro (mobile) bundles `@ember/store`'s barrel, so exporting
  `node-sqlite-driver` (imports `node:sqlite`) AND `conformance` (imports `vitest`) crashed
  `expo export -p android` with "attempted to import node:sqlite". Fixed: `index.ts` exports only
  the consumer surface (repository/sqlite-driver/sqlite-repository/memory/dexie); tests import
  `conformance.js` + `node-sqlite-driver.js` via relative paths (they already did). This also made
  the mobile `@types/node`/`types:["node"]` additions unnecessary — reverted both; only
  `packages/store` keeps node types (for the node driver file + its test). Verified headlessly:
  `expo export -p android` → "Android bundles (1) … Exported: dist".
  **Carry-forward: never re-export vitest/node-only modules from a package barrel a client bundles.**
- **DEVICE-BOUND (user, before merge):** `npx expo start` in apps/mobile → Home has a `__DEV__`
  "Dev · device verifications" link → **Unit 03c** screen. Tap "Run all" (conformance smoke must go
  green), then for persistence: tap "1. Write persistence marker" → fully reload the app → tap
  "2. Read persistence marker" (must show the pre-reload stamp = real on-disk SQLite persistence).
  Interactive harness, NOT console logs.
- **Device-verification convention established** (ai-workflow-rules.md): every device-bound unit
  drops an interactive screen under `apps/mobile/app/dev/` fed by the shared
  `src/dev/verification-harness.tsx`, listed in `app/dev/index.tsx`, reached via the `__DEV__` home
  link. **Throwaway** — once all checks are green, delete `app/dev/` + `src/dev/` + the home link in
  the same PR (the real `src/store/expo-sqlite-driver.ts` adapter stays). Files added this turn:
  `src/dev/verification-harness.tsx`, `app/dev/index.tsx`, `app/dev/sqlite-03c.tsx`, `__DEV__` link
  in `app/index.tsx`.

## Current Goal
- **Unit 03c (#31) DONE — device-verified, harness removed, PR opened.** expo-sqlite/mobile
  `Repository` via driver-port. User ran the interactive verification screen on device: conformance
  smoke + persistence-across-reload all green. Throwaway harness (`app/dev/`, `src/dev/`, `__DEV__`
  home link) deleted in the same PR per the convention; real `src/store/expo-sqlite-driver.ts` stays.
  typecheck 9 ✓ · test 52 ✓ · lint 6 ✓ · `expo export -p android` ✓. Spec:
  specs/03c-sqlite-mobile-repository.md. Store epic COMPLETE: 03a ✓ → 03b ✓ → 03c ✓.
- **Next:** Unit 04 (Import + document identity + Library list, issue #4) — first real entities land
  on the store; SHA-256 doc identity. Backlog in GitHub Issues.
- Backlog lives in GitHub Issues (repo pena56/ember); Unit NN ⇄ Issue #NN ⇄ feat/NN-… ⇄
  specs/NN-….md ⇄ PR "Closes #NN".

## Durable decisions (project-wide)
- **KV persistence via `expo-sqlite/kv-store`, NOT AsyncStorage** (2026-06-08): expo-sqlite is the
  chosen local store (architecture.md); its kv-store is an AsyncStorage-compatible, SQLite-backed
  API — one fewer dependency.

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
