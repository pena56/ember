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

## Unit 04d build notes (2026-06-09)
- Done (apps/web): shadcn/ui foundation. `shadcn init` (new-york style — switched off the CLI-default
  `base-nova` because it pulls `@base-ui/react`; new-york uses the unified `radix-ui` pkg) + added
  Button/Card/Sonner into `src/components/ui/`; `@/* → ./src/*` alias in tsconfig + vite + vitest; `cn()`
  in `src/lib/utils.ts`. CSS entry `styles.css`: `@import "tailwindcss"` → `tw-animate-css` → tokens, then
  **shadcn semantic vars aliased BY REFERENCE to `@ember/tokens` vars** (`--primary:var(--color-accent)`,
  `--background:var(--color-surface)`, `--card:var(--color-surface-raised)`, `--foreground/...:
  var(--color-text)`, `--muted-foreground:var(--color-text-muted)`, `--border/--input:var(--color-line)`,
  `--ring:var(--color-accent)`, `--primary-foreground:var(--color-on-accent)`, `--radius:var(--radius-md)`;
  destructive is the one allowed hardcoded fallback — no token yet). Dark mode via
  `@custom-variant dark (… [data-app-theme="warm-dark"] …)` keyed to the EXISTING ThemeProvider attribute,
  NOT `.dark` — and because each aliased token already switches under `[data-app-theme="warm-dark"]` in
  theme.css, shadcn surfaces flip for free. Palette stays single-sourced in packages/tokens (invariant #6).
- Sonner retrofit of 04b: removed the inline notice state/banner; import feedback now `toast.success`/
  `toast`/`toast.error` (added/deduped/rejected, warm voice); `<Toaster>` mounted once in App.tsx, themed
  from our own `useTheme().resolvedTheme` (NOT next-themes, which the CLI assumed — removed it +
  CLI-added geist font). `import-dropzone` accent button → shadcn `<Button>` (kills the `text-white`
  hardcode = 04b nit **N1**). Import/dedupe/OPFS/persistence logic untouched.
- ESLint override scoped to `apps/web/src/components/ui/**` ONLY (vendored shadcn — relaxes filename-case/
  naming/import-order/react-refresh); authored `src/library`+`src/store` stay strict.
- Built (Sonnet) → impeccable (light pass on retrofit) → fresh-context review (Opus) =
  **CHANGES-REQUESTED → fixed**. BLOCKER (a11y): `--color-on-accent` was `#ffffff` — white on the amber
  accent is 3.2:1 (light) / 2.4:1 (dark), fails WCAG AA for button text (same class as 02b's catch).
  **Fixed:** `--color-on-accent` → dark ink `#2a2422` (passes 4.7:1 / 6.5:1) across index.ts + theme.css +
  theme.uniwind.css + parity test. Reviewer verified token aliasing single-sourced, dark wiring, boundary
  isolation (core/store/mobile byte-identical), lint scoping, Sonner tests not hollowed; re-ran all gates.
- Token change this unit: added `--color-on-accent` to packages/tokens (TS + both CSS + parity test) —
  the proper N1 fix (was an app-level `text-white`). Nit (deferred, harmless): the explicit
  `[data-app-theme="warm-dark"]` block in styles.css is redundant (tokens already switch) — left for
  legibility; could be trimmed to a comment later.
- typecheck 9 ✓ · test 29 web + 23 tokens (+ store/mobile) ✓ · lint 6 ✓. Deps added by CLI (sonner,
  lucide-react, radix-ui, cva, clsx, tailwind-merge, tw-animate-css, @types/node). core/store/mobile
  untouched. **Carry-forward: web UI now builds on shadcn (ui-context.md); handroll only the gaps.**
- **BROWSER-VERIFY (user, before merge):** `pnpm --filter @ember/web dev` → import a PDF → bottom-right
  success toast; re-import → "already in your library" toast; drop a non-PDF → error toast; toggle
  System/Light/Dark → shadcn Button/Card + toasts all re-theme; Tab to "Add PDF" → accent focus ring;
  primary button = ember accent with dark-ink label (readable, no white-on-amber).

## Unit 04b build notes (2026-06-09)
- Done (apps/web): `OpfsBlobStore` (OPFS-backed BlobStore, blobs/ subdir, lazy dir handle, copy-
  through inherent); `subtleCryptoHasher` (Web Crypto `crypto.subtle.digest` → lowercase hex);
  `createWebClock` (localStorage-persisted HLC clock + stable device id, fully injectable deps);
  `createWebStore` (composes repo+blobs+hasher+clock into `importPdf`/`listDocuments` surface);
  `StoreProvider`/`useWebStore` (mirrors ThemeProvider shape; skips production store construction when
  injected store prop present — prevents OPFS crash in jsdom); Library screen (`LibraryPage`,
  `ImportDropzone`, `DocumentRow`, `use-library`) with drag-drop + hidden file input, ember flame SVG
  + drag-over "warming" state, warm empty state, inline dismiss-able notices, recently-added-first
  list, relocated theme control in sticky header. All token-only (no hardcoded values). `App.tsx`
  replaced with `<LibraryPage />`; `StoreProvider` wired inside `ThemeProvider` in `main.tsx`.
- Tests: `format-bytes.test.ts` (4), `subtle-crypto-hasher.test.ts` (3 known SHA-256 vectors),
  `web-clock.test.ts` (7 — monotonic stamps, counter bumps, reload persistence), `library-page.test.tsx`
  (5 — empty state, import adds row, dedupe adds no row, non-PDF rejected, theme control aria-pressed).
  OpfsBlobStore NOT unit-tested (no OPFS in jsdom) — browser-verified step below.
- Built TDD-first (Sonnet) → frontend-design (Library screen) → impeccable (polished: em-dash → comma,
  h2 heading hierarchy, dismiss button 44×44 touch target, motion-safe animation guards, `opacity-50`
  empty state icon, items-center row alignment, role="status" loading) → gate fixes (Hasher import from
  @ember/core not @ember/store; Uint8Array cast for TS6; react-hooks/set-state-in-effect restructured
  via loadTick counter; import-x/order; prefer-const; unused var).
- typecheck 9 ✓ · test 29 web (7 files) ✓ · lint 6 ✓. `@ember/store: workspace:*` added to apps/web deps.
  packages/core and packages/store unchanged (byte-identical). Invariants #1/#2/#6 intact.
- Fresh-context review (Opus) = **APPROVE-WITH-NITS**, NO blockers. Reviewer re-ran all gates, hand-
  verified HLC monotonicity-across-reload + counter restore, confirmed packages/ byte-identical to main,
  and independently confirmed the SHA-256 test vectors are correct (`abc`/empty). Nits N2 (spec listed
  `format-bytes.ts` under library/, lives under store/ — organizational, no effect) + N3 (web-store ticks
  the HLC eagerly even on dedupe — harmless, monotonic, no outbox entry written; lazy-stamp would be a
  core change, out of scope) left as-is.
- **Follow-up (defer — own micro-unit against packages/tokens, like 02b's token deferrals; do NOT widen
  04b's diff into the tokens pkg + its parity test):** N1 — `import-dropzone.tsx` accent button uses
  `text-white` (the only hardcoded color; soft invariant-#6 deviation). Add a semantic `--color-on-accent`
  token to `packages/tokens` (TS source + theme.css + theme.uniwind.css, extend parity test) and switch to
  `text-on-accent`. Value is visually fine on the orange accent — quality debt, not a bug.
- **BROWSER-VERIFY (user, before merge):** `pnpm --filter @ember/web dev` → Chromium (localhost, secure
  context) → drop a PDF → row appears with derived title → full page reload → row persists (real OPFS
  + Dexie) → re-drop same file → dedupe notice, no second row. Non-PDF → gentle rejection notice.
  Theme toggle (System/Light/Dark) still works with focus-visible a11y pattern.

## Unit 04a build notes (2026-06-09)
- Done: `@ember/core` document layer (`document.ts`: `Document` type [id=sha256 hex, title, filename,
  byteSize, contentType, importedAt — NO pageCount until reader/05], `Hasher` port, `computeDocumentId`,
  `makeDocument` w/ filename→title strip; pure, caller supplies time/uuid/hlc, core stays runtime-dep-free).
  `@ember/store`: `BlobStore` port (content-addressed by doc id) + `MemoryBlobStore` reference impl
  (Map-backed, slice()-copies in/out for value isolation, idempotent close) + `runBlobStoreConformance`
  (test-only, NOT barrel-exported — 03c Metro carry-forward); `documents.ts` `importDocument` (hash →
  dedupe-by-content-id → new doc: put record + blob + EXACTLY ONE HLC-stamped outbox entry; identical
  bytes = no-op merge, zero 2nd outbox) + `listDocuments` + `DOCUMENTS_COLLECTION`.
- Built (Sonnet, TDD: core 30 [+7 new], store 69 [+9 blob conformance +8 documents]) → fresh-context
  review (Opus) = **APPROVE**, no blockers/should-fixes. Applied 1 nit (merged duplicate `@ember/core`
  import). Reviewer re-ran all gates on a busted cache + verified barrel safety, value isolation, exactly-
  once outbox, core purity, 03a/b/c suites byte-identical.
- typecheck 9 ✓ · test 5 tasks/139 ✓ · lint 6 ✓. No new dep. Invariants #1/#2 + core purity intact.

## Current Goal
- **Unit 04a (#34) MERGED** — PR #35 merged to main (CI verify ✓ 52s), branch deleted. Shared
  document brain: core `Document`+`Hasher` port+identity, store `BlobStore` port+`MemoryBlobStore`+
  `importDocument` (dedupe-by-sha256, exactly-once outbox)+`listDocuments`. Spec:
  specs/04a-document-model-identity.md. **Decisions (confirmed w/ user):** SHA-256 via `Hasher` port
  (mirrors 03c driver port); PDF bytes via a `BlobStore` port; core runtime-dep-free (zod deferred).
- **Unit 04b (#36) MERGED** — PR #37 merged to main (CI verify ✓ 49s), branch deleted, BROWSER-VERIFIED
  by user (drag-drop + picker import, dedupe, on-disk persistence across reload all ✓). Web import +
  Library list (apps/web): 04a ports bound to browser APIs (`BlobStore`→OPFS, `Hasher`→SubtleCrypto,
  `Repository`→DexieRepository) + minimal localStorage-persisted HLC clock/device id; Library screen
  (drag-drop + picker PDF import, dedupe-by-hash, recently-added-first, empty state, display-only rows).
  See Unit 04b build notes below.
- **UI DIRECTION CHANGED (2026-06-09, user):** adopt **shadcn/ui** as the web component foundation —
  handroll web components only where shadcn has no good fit; otherwise compose shadcn primitives (e.g.
  Sonner toasts, not inline banners). **Supersedes the 2026-06-08 "bespoke, no UI kit" decision** —
  recorded in ui-context.md "Component Library" + the styling memory. Mobile stays bespoke uniwind
  (shadcn is Radix/web-only). shadcn themes via CSS vars mapped to Amber Ember tokens → invariant #6 holds.
- **Unit 04d (#38) MERGED** — PR #39 merged to main, branch deleted, BROWSER-VERIFIED by user (import
  toasts + light/dark re-theming of shadcn surfaces + readable dark-ink button + focus ring all ✓). Web
  UI foundation: shadcn (Button/Card/Sonner) on apps/web, CSS vars aliased by reference to Amber Ember
  tokens, dark mode via existing `data-app-theme`; retrofitted 04b notices → Sonner toasts + accent button
  → shadcn Button (closed nit N1). Review (Opus) = CHANGES-REQUESTED (a11y) → fixed `--color-on-accent`
  white→dark-ink `#2a2422`. See Unit 04d build notes below. Spec: specs/04d-web-ui-foundation-shadcn.md.
- **CI fix (post-review, on the 04d branch):** first CI run RED — `ERR_PNPM_IGNORED_BUILDS: msw@2.14.6`.
  msw is a transitive optional dep of `@vitest/mocker` that entered the lockfile during the shadcn
  re-resolve; it ships a build script, and pnpm fails frozen CI installs until each build script is
  explicitly allowed/denied. **Fixed:** `allowBuilds: msw: false` in `pnpm-workspace.yaml` (we never
  import msw). Re-run CI verify ✓ 50s. **Carry-forward: any new dep with a postinstall/build script must
  be added to `allowBuilds` in pnpm-workspace.yaml (true to run it, false to skip) or CI install fails.**
- **Then:** **04c** mobile import + Library list (expo-file-system BlobStore, expo-crypto Hasher;
  device-bound). Run `spec 04c` when ready (independent of 04d — mobile UI untouched by shadcn).
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
