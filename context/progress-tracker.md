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
- **Unit 17c MERGED (2026-06-30) — PR #146 (squash `5b48884`, branch deleted), Issue #145 CLOSED;
  CI `verify` green (1m35s). Umbrella #17 (Settings) OPEN — 17a + 17b + 17c done.** Notification
  preferences now persist + sync: singleton `notificationPreferences:default` settings record in
  `packages/store/notification-preferences.ts` (near-clone of `goal-config.ts`) read/written through
  Repository + outbox with HLC stamp, riding the generic `records`/`sync.ts` pipeline (LWW via shared
  reconciler — no convex change, no core change). `get`→normalized-or-default(`updatedAt:''`),
  `set`→put + exactly one HLC-stamped outbox entry; `normalizePrefs` fills enabledTypes keys + clamps
  quiet hours int[0,24] (no degenerate fallback — that's core's `resolveNotificationConfig`). Sonnet TDD
  (10 new tests, store 108→118) → fresh-context Opus review = APPROVE (zero defects; #2 outbox+HLC & #5
  no-bespoke-merge upheld, no boundary leak). Gates green (typecheck · 1,465 ws tests · lint). Local
  `main` fast-forwarded. **NEXT slices for #17:** mobile Settings UI wiring (expose prefs via native-store
  get/set + toggles/quiet-hours pickers into 17a's Settings screen — UI unit, runs frontend-design/impeccable),
  then web settings parity, then explicit-primary (convex election change) + the two deferred claim-review
  client units.
  <!-- 17c SPECCED note retained below for trail -->
- **Unit 17c SPECCED + DISPATCH-READY (2026-06-30) — Issue #145 (umbrella #17, THIRD slice), branch
  feat/145-store-notification-preferences, spec specs/17c-store-notification-preferences.md. Route standard,
  NON-UI** (one boundary `packages/store`, no new dep). Persist + sync the 17b `NotificationPreferences`
  value as a singleton settings record — **near-clone of `packages/store/src/goal-config.ts`**, riding the
  existing generic outbox/`records` pipeline (LWW by `updatedAt` HLC; verified sync.ts keys `collection:
  v.string()` with NO allowlist, so a new collection syncs for free → **no convex change**; reuses 17b core
  symbols → **no core change**). **Deliverables (all `packages/store`):** new `notification-preferences.ts` —
  `NOTIFICATION_PREFERENCES_COLLECTION`/`_ID`(`'default'`), `NotificationPreferencesRecord` ({id, prefs,
  updatedAt}), `getNotificationPreferences(repo)` (stored→normalized, else default w/ `updatedAt:''`),
  `setNotificationPreferences(deps, prefs)` (normalize → put + exactly one HLC-stamped outbox entry), private
  `normalizePrefs` (fill enabledTypes keys from default, clamp quiet hours int[0,24]); barrel export. **Test:**
  MemoryRepository, mirrors `goal-config.test.ts` — default-on-empty, set persists + one outbox entry/call,
  updatedAt encoded HLC > '', normalize fills/clamps. No UI; platform-store exposure + Settings wiring land in
  the next mobile/web slices. Dispatch: Sonnet TDD → fresh-context Opus reviewer (verify #2 outbox+HLC, #5 no
  bespoke merge, exactly-one-entry, singleton id) → PR "Closes #145". No deploy gate. **Next after 17c:**
  mobile Settings UI wiring (expose via native-store + toggles/quiet-hours pickers into 17a's screen), then web
  settings parity + explicit-primary (convex election) + the two deferred claim-review client units.
  <!-- 17b MERGED note retained below for trail -->
- **Unit 17b MERGED (2026-06-30) — PR #144 (squash `86ca013`, branch deleted), Issue #143 CLOSED;
  CI `verify` green (1m37s). Umbrella #17 (Settings) OPEN — 17a + 17b done.** Pure-core preference model
  now feeds the planner: per-type `enabledTypes` gate + quiet-hours, single-sourced from `NOTIFICATION_PRIORITY`,
  all-true default keeps planner output byte-identical. Sonnet TDD → fresh-context Opus review = APPROVE
  (no blockers/nits). core test 460→483. **Next slices for #17:** preference persistence + sync
  (store/outbox `NotificationPreferences` record, LWW via shared engine), then mobile Settings UI wiring
  (toggles + quiet-hours pickers into 17a's screen), then web settings parity + explicit-primary (convex
  election) + the two deferred claim-review client units. Local `main` fast-forwarded cleanly.
  <!-- 17b BUILT note retained below for trail -->
- **Unit 17b BUILT + REVIEWED + PR OPEN (2026-06-30) — PR #144, Issue #143 (umbrella #17, SECOND slice),
  branch feat/143-core-notification-preferences.** Sonnet TDD executor built it (21 new tests) →
  fresh-context Opus reviewer = **APPROVE** (no blockers/nits; re-ran all gates green; verified default
  parity byte-identical, gate positioned after raw collection / before quiet-hours, #1 core purity + #5
  single-source, all clamp/fallback edge cases, existing 16a/16d tests unchanged). **Ships (all
  `packages/core`):** `enabledTypes: Record<NotificationType, boolean>` added to `NotificationConfig` +
  all-true default (keys from `NOTIFICATION_PRIORITY`), `planNotifications` drops disabled types
  pre-quiet-hours; new `notification-preferences.ts` (`NotificationPreferences` + `DEFAULT_NOTIFICATION_PREFERENCES`
  + pure `resolveNotificationConfig` — clamps quiet hours int[0,24], degenerate start>=end → 8/22, sparse
  partial); barrel export. typecheck 9 ✓ · test core 460→483 (total 844) ✓ · lint 6 ✓. No new dep, no deploy
  gate (no schema/cron change). **Awaiting merge.** **Next after 17b:** preference persistence + sync
  (store/outbox record), then mobile Settings UI wiring, then web settings parity + explicit-primary (convex
  election) + the two deferred claim-review client units.
  <!-- 17b SPECCED note retained below for trail -->
- **Unit 17b SPECCED + DISPATCH-READY (2026-06-30) — Issue #143 (umbrella #17, SECOND slice), branch
  feat/143-core-notification-preferences, spec specs/17b-core-notification-preferences.md. Route standard,
  NON-UI** (one boundary `packages/core`, pure TS, no new dep). The preference model that feeds the
  planner. **Forks settled with user (2026-06-30):** (1) **core-model-only slice** — persistence/sync,
  mobile/web Settings UI, and explicit-primary all defer to later slices (mirrors #16's by-boundary split);
  (2) **explicit-primary OUT** — it changes 16b's convex `electPrimaryDevice`, a different boundary;
  (3) **per-type, all 4** independent on/off (streak-risk/goal-progress/best-time/lapse-reengage);
  (4) **local-first synced record** — `NotificationPreferences` is the per-account persisted shape a later
  slice writes through the outbox (LWW via shared engine); this slice only defines its shape. **Deliverables
  (all `packages/core`):** add `enabledTypes: Record<NotificationType, boolean>` to `NotificationConfig` +
  default all-true (keys derived from `NOTIFICATION_PRIORITY`) and filter disabled types out of
  `planNotifications` candidates (pre-quiet-hours); new `notification-preferences.ts` — `NotificationPreferences`
  type + `DEFAULT_NOTIFICATION_PREFERENCES` + pure `resolveNotificationConfig(prefs)→Partial<NotificationConfig>`
  (clamps quiet hours to int[0,24], degenerate start>=end falls back to 8/22, sparse partial output); barrel
  export. No persistence/UI/convex/store change; no `Date.now()`, no zod. **Test:** default-parity, per-type
  disable shifts selection, all-disabled⇒null, custom/degenerate quiet-hours, partial-prefs passthrough; all
  existing 16a/16d tests stay green. Dispatch: Sonnet TDD → fresh-context Opus reviewer (verify #1 core purity
  + #5 single-source decision, default behaviour byte-identical) → PR "Closes #143". No deploy gate.
  **Next after 17b:** preference persistence + sync (store/outbox record), then mobile Settings UI wiring,
  then web settings parity + explicit-primary (convex election) + the two deferred claim-review client units.
  <!-- 17a MERGED note retained below for trail -->
- **Unit 17a MERGED (2026-06-30) — PR #142 (squash `a7dc064`, branch deleted), Issue #141 CLOSED.
  Umbrella #17 (Settings) OPEN — 17a is its FIRST slice; #16 push delivery now lights up on-device.**
  Built Sonnet-TDD (pure `derivePushControlState`, 4 tests; thin native/hook/UI glue) → frontend-design +
  impeccable (Settings modal: section-card layout, bespoke token-driven toggle, a11y) → fresh-context Opus
  review = APPROVE (no convex/core/store change; raw token never in our schema; #1/#6/#7 held). Two review
  nits fixed pre-merge (focus-bound refresh; dead provisional fallback). Final gates green (typecheck 9 ·
  test mobile 357→361 +4 · lint). **Ships:** Settings screen + modal route + Today-header gear, permission
  → `getExpoPushTokenAsync` → `registerDevice({expoPushToken})`, foreground handler + tap responder,
  optional `expoPushToken` on `NotificationPort`.
  **Device bring-up (this session, all merged in #142):** set up a push-capable dev build — added
  `expo-dev-client` + `eas.json` (development profile, internal APK); user ran `eas login`/`eas init`
  (wrote `extra.eas.projectId` + owner `pena56`). Real-device debugging surfaced + fixed a chain:
  (1) **Android FCM** — `getExpoPushTokenAsync` threw "Default FirebaseApp not initialized" → added
  `android.googleServicesFile` + committed `google-services.json` (NOT secret; FCM V1 service-account key
  is `.gitignore`d, upload via `eas credentials`); (2) **`SERVICE_NOT_AVAILABLE`** (transient FCM
  registration) → added retry-with-backoff to `acquireExpoPushToken` + a `console.warn` so token failures
  are visible; resolved on device by reboot/clock/Play-Services; (3) **toggle reset on modal remount**
  (reviewer nit #1 as a real bug) → `refresh()` now reconciles `hasToken` from server `getNotificationState`
  for this deviceId on focus (added to `NotificationPort` + convex adapter + sync-test fake), keeping the
  optimistic flip on `enable()`. Toggle now turns on AND persists; token acquired (`hasToken:true`).
  **Device delivery VERIFIED (2026-06-30):** Part B done — `ember-service-account.json` uploaded via
  `eas credentials` (FCM V1); a due intent fired and a real push LANDED on device. End-to-end
  decide→submit→dedupe→relay→deliver is now proven green on hardware. **17a fully complete (in-repo +
  on-device); nothing left hanging.** **Next: 17b** notification preferences (quiet-hours / enabled-types
  / explicit-primary + the preference model feeding `deriveNotificationSync`); then 17c+ web settings
  parity + the two deferred claim-review client units.
  <!-- 17a SPECCED note retained below for trail -->
- **Unit 17a SPECCED + DISPATCH-READY (2026-06-29) — Issue #141 (umbrella #17, FIRST slice), branch
  feat/141-mobile-push-enablement, spec specs/17a-mobile-push-enablement.md. Route standard, NET-NEW UI**
  (one boundary `apps/mobile`; product resolved → builds a new Settings screen, so `frontend-design` +
  `impeccable` run before `code-review`). **This is the slice that turns #16 delivery ON:** today every
  mobile device registers no-token (16e) so `electPrimaryDevice` finds no target; 17a adds permission +
  `getExpoPushTokenAsync` → `registerDevice({expoPushToken})` (flips `hasToken` true) + foreground handler
  + tap responder. **Forks (settled 2026-06-29 with user):** Settings screen is the home (not Today card /
  launch modal) · 17a includes the foreground+tap handlers (end-to-end) · preferences (quiet-hours/types/
  primary) → 17b, web settings + claim-review → later · token needs an EAS `projectId` (absent today →
  flow+UI ship, real acquisition activates once `extra.eas.projectId` exists, #16 "ships dark" precedent;
  hook fail-softs when absent) · permission-denied deep-links to system settings. **Deliverables:**
  `expo install expo-notifications` (+ app.json plugin); `src/notify/native-notifications.ts` (thin RN
  wrapper, untested), `src/notify/push-control-state.ts` (**pure, node-tested** `derivePushControlState`),
  `src/notify/use-push-enablement.ts` (thin hook `{state, enable()}`), extend `NotificationPort.registerDevice`
  arg with optional `expoPushToken` (convex adapter+mutation already accept it — no convex change);
  `src/settings/settings-screen.tsx` + `app/settings.tsx` (modal route mirroring account.tsx) +
  `settings-button.tsx` gear in Today header (mirrors AccountButton); `use-notification-handlers.ts`
  mounted once in `AnonymousAuthGate`. **Test:** `push-control-state.test.ts` (4 cases); hooks/native/UI
  are thin glue / design surfaces (typecheck+impeccable+review). No core/store/convex schema change —
  raw token still never in our schema (only the Expo component). Dispatch: Sonnet TDD → frontend-design →
  impeccable → fresh-context Opus reviewer (verify #1/#6/#7 + token-never-stored + core untouched) → PR
  "Closes #141". Device verification (with a projectId, real device) is the first time real push delivery
  matters; headless+design-verifiable without one. **17a is the FIRST slice of umbrella #17.**
  <!-- #16 COMPLETE note retained below for trail -->
- **🎉 UMBRELLA #16 (Notification engine) COMPLETE (2026-06-29) — Issue #16 CLOSED.** End-to-end:
  core decides (16a) → server dedupes/relays (16b) → both clients submit/suppress (16c web, 16e
  mobile) from one hoisted derivation (16d). All five slices MERGED. **Remaining notification work →
  #17 Settings** (the device-notification surface: `expo-notifications` permission + priming UI,
  `getExpoPushTokenAsync` → `registerDevice(token)`, foreground handler + tap responder, quiet-hours
  / enabled-types / explicit-primary overrides — until #17 grants a token no device is push-eligible,
  so #16 ships the full decide→submit→dedupe→relay pipeline with delivery activated in #17) **plus two
  deferred claim-review client units (web + mobile).**
- **Unit 16e MERGED (2026-06-29) — PR #140 (squash `4a15663`, branch deleted), Issue #139 closed;
  CLOSES umbrella #16.** Mobile notification-sync pipeline: added `deviceId` to mobile `SyncBundle`
  (from `clock.deviceId`); new `apps/mobile/src/notify/` — RN-free `notification-port.ts`, node-tested
  `run-notification-sync.ts` (register no-token → core `deriveNotificationSync` → submitIntent →
  claimSlot('suppressed')), `convex-notification-port.ts` (mirrors web), thin `use-notification-sync.ts`
  reusing the pure `createSyncScheduler`; mounted in `AnonymousAuthGate` after `useReconciler()`.
  Sonnet TDD → fresh-context Opus reviewer = **APPROVE** (traced all 4 test cases incl. the
  no-candidate fixture through the real engine; verified #1/#2/#5/#7, core untouched, no
  `expo-notifications`/token/local-fire, no new deps). One cosmetic nit fixed pre-merge (dead-code
  fallback store re-hardcoding `DEFAULT_GOAL_ACTIVE_MS` → honest `store===null` guard). typecheck 9 ✓ ·
  test mobile 357 (+4) ✓ · lint 6 ✓ · CI verify green. Local `main` fast-forwarded cleanly (spec/tracker
  commit `ab7f6a4` already on main — no divergence). Permission/token/local-fire deferred to #17.
  <!-- 16e spec note retained below for trail -->
- **Unit 16e SPECCED + DISPATCH-READY (2026-06-29) — Issue #139 (umbrella #16, FINAL slice), branch
  feat/139-mobile-notification-sync, spec specs/16e-mobile-notification-sync.md. Route standard, NON-UI**
  (one boundary `apps/mobile`; renders nothing → no design skills; fully resolved). The mobile twin of 16c,
  now consuming the hoisted core `deriveNotificationSync`/`notificationCopy` (16d). **Forks (all settled
  2026-06-29):** server-push-only (no local fire) · permission+token deferred to #17 (registers **no-token**,
  so no device is push-eligible until #17) · derivation single-sourced in core. **Deliverables:** add
  `deviceId` to mobile `SyncBundle` (from `clock.deviceId`); new `apps/mobile/src/notify/` —
  `notification-port.ts` (RN-free `NotificationPort`, platform `ios|android`), node-tested
  `run-notification-sync.ts` (register no-token → derive → submitIntent → claimSlot('suppressed')),
  `convex-notification-port.ts` (mirror web), thin `use-notification-sync.ts` adapter **reusing the existing
  pure `createSyncScheduler`** (gated auth+bundle, lazy convex port, NativeStore via ref) — mount in
  `AnonymousAuthGate` after `useReconciler()`. **Differs from web:** follows mobile's scheduler+adapter split
  (not web's inline hook); only `run-notification-sync` is node-tested, the hook is untested thin glue like
  `use-reconciler`. No new deps (NO `expo-notifications` — that's #17). Dispatch: Sonnet TDD → fresh-context
  Opus reviewer (verify #1/#2/#5/#7 + core untouched + no expo-notifications) → PR "Closes #139". No deploy
  gate. Device verification optional/non-blocking (no token → nothing fires; logic is headless-verifiable).
  **Merging 16e CLOSES umbrella #16** (core decides → server dedupes/relays → both clients submit/suppress
  from one derivation). Remaining notification work → #17 Settings + two deferred claim-review client units.
  <!-- 16d MERGED note retained below for trail -->
- **Unit 16d MERGED (2026-06-29) — PR #138 (squash `6bd7ac8`, branch deleted), Issue #137 closed.** Pure-code
  hoist: `deriveNotificationSync` + `notificationCopy` (+ both tests) now in `@ember/core`; web repointed; four
  old web files deleted. Reviewer APPROVE; typecheck 9 / test core 462 (+2) web 413 (−2) / lint 6 green; no
  `Date.now()`/platform API added to core; #5 single-sourcing strengthened. Local `main` fast-forwarded cleanly
  (doc commits squashed in — no divergence this time). **Umbrella #16: 16a/16b/16c/16d MERGED — only 16e
  (mobile sync) remains; it closes #16.**
  <!-- 16d dispatch + spec notes retained below for trail -->
- **Unit 16d DISPATCHED + PR OPEN, IN REVIEW (2026-06-29) — PR #138, Issue #137 (umbrella #16), branch
  feat/137-notify-core-hoist (commit `3fc2e77`).** Pure-code move executed (Sonnet TDD) → fresh-context Opus
  reviewer = **APPROVE** (no behavior/logic/copy drift, core purity preserved, #5 single-sourcing strengthened,
  no dangling imports). `deriveNotificationSync` + `notificationCopy` + both tests now live in `packages/core`
  (`notification-sync.ts`/`notification-copy.ts`, tests in `core/src/tests`); core index re-exports both; web
  `use-notification-sync.ts` repointed to `@ember/core`; four old web files deleted (git renames). Engine-symbol
  imports rewritten intra-core relative (`./notification.js`, `./session.js`, `./streak.js` for
  `deriveTodayGoal`/`DEFAULT_GOAL_ACTIVE_MS`). Verify: typecheck 9 ✓ · test core 462 (+2) / web 413 (−2), total
  preserved ✓ · lint 6 ✓ · no `Date.now()`/`new Date()` in core. No deploy gate. **Awaiting merge → then 16e
  (mobile sync, closes #16).**
  <!-- 16d spec note retained below for trail -->
- **Unit 16d SPECCED + DISPATCH-READY (2026-06-29) — Issue #137 (umbrella #16), branch
  feat/137-notify-core-hoist, spec specs/16d-notify-core-hoist.md. Route standard** (pure-code hoist, zero
  behavior change). **Umbrella #16 reshaped (forks 2026-06-29):** the remaining "mobile" work splits into
  **16d = hoist notify derivation into @ember/core** (this) → **16e = mobile notification sync** (closes #16).
  Forks resolved with user: (1) **server-push-only** — mobile does NOT schedule local notifications; the 16b
  cron is the sole deliverer; (2) **permission fully deferred to #17** — mobile gets no Expo token this
  slice, so #17 owns the entire device-notification surface (permission/priming, token, handler+responder,
  delivery); (3) **hoist-to-core first** — single-source the decision (invariant #5) so web (16c) + mobile
  (16e) share one `deriveNotificationSync`/`notificationCopy` rather than duplicating. **16d deliverables:**
  move `deriveNotificationSync` (+ `NotificationSyncInput`/`SubmitIntent`/`NotificationSyncPlan` types) →
  `packages/core/src/notification-sync.ts` and `notificationCopy` → `packages/core/src/notification-copy.ts`
  (+ move both tests to core/src/tests), re-export from core index; repoint `apps/web` `use-notification-sync.ts`
  import to `@ember/core`; delete the four moved web files. `NotificationPort` stays web-local. Dispatch:
  Sonnet TDD executor (verify the moved tests pass in core, web hook test still green) → fresh-context Opus
  reviewer (verify #5 single-sourcing strengthened, core purity preserved — no `Date.now()`/platform API
  introduced) → PR "Closes #137". No deploy gate. **16e (next): mobile twin of 16c — add `deviceId` to mobile
  SyncBundle, `useNotificationSync` hook (register no-token → submitIntent → claimSlot suppressed), mount in
  AnonymousAuthGate; no expo-notifications/permission/local-fire. Closes #16.**
  <!-- 16c MERGED note retained below for trail -->
- **Unit 16c MERGED (2026-06-29) — PR #136 (squash `e54ff4a`, branch deleted), Issue #135 closed.** Web
  notification wiring: auth+bundle-gated `useNotificationSync` runs 16a's engine over the local session log,
  submits the day's `selected` plan as an intent, and `claimSlot('suppressed')` for today's keys once the
  goal is met. No UI, no local fire, no permission prompt (deferred to #17). 25 new tests; Sonnet TDD →
  fresh-context Opus review APPROVE-WITH-NITS, both nits fixed. Sensible deviation: lazy Convex adapter
  factored into `notify/convex-notification-port.ts` (mirrors `convex-sync-transport.ts`). typecheck 9 /
  test 56 files·425 / lint 6 green. No deploy gate (no schema/cron change). **Umbrella #16: 16a/16b/16c
  MERGED — only 16d (mobile, device-bound: expo-notifications permission + token + local scheduling +
  claimSlot) remains to close #16.** Spec/dispatch trail retained below.
  <!-- 16c dispatch + spec notes retained below for trail -->
- **Unit 16c DISPATCHED + PR OPEN, IN REVIEW (2026-06-29) — PR #136, Issue #135 (umbrella #16, third
  slice), branch feat/135-web-notification-sync.** Sonnet TDD executor built it (25 new tests) → fresh-context
  Opus review = **APPROVE WITH NITS**, both nits fixed (the "Convex singleton never imported when a port is
  injected" test now genuinely enforces the guarantee + a positive control; `store` dropped from the effect
  deps to mirror `useReconciler`). One sensible deviation from spec: the lazy Convex adapter was factored into
  `notify/convex-notification-port.ts` (mirrors `convex-sync-transport.ts`) instead of inlined. typecheck 9 /
  test 56 files·425 / lint 6 all green. **Awaiting merge (no deploy gate — no schema/cron change).** Spec
  details retained below.
  <!-- 16c spec note retained below for trail -->
- **Unit 16c SPECCED + DISPATCH-READY (2026-06-29) — Issue #135 (umbrella #16, third slice), branch
  feat/135-web-notification-sync, spec specs/16c-web-notification-sync.md. Route standard, NON-UI** (one
  boundary `apps/web`, background-hook wiring mirroring `useReconciler`/`useBlobSync`; no new dep; reuses
  16a `planNotifications` + 16b `api.notifications.*`). **Forks resolved with user (2026-06-29):**
  (1) **no local web fire** — web shows no Notification, schedules no timer; all delivery rides mobile
  push (16d); web's job is engine → `submitIntent` → suppress-on-read only; (2) **permission UX deferred
  to #17 Settings** — no prompt this slice (web never needs `requestPermission`). So **no
  frontend-design/impeccable step** (no UI). Deliverables (all `apps/web`): `notify/notification-copy.ts`
  (pure warm-voice `notificationCopy(type)→{title,body}`); `notify/derive-notification-sync.ts` (pure
  `deriveNotificationSync(input)→{intent,suppress}` — goal-met ⇒ intent=null + suppress all four
  `${type}:${today}` keys; else submit 16a's `selected` + copy); `notify/use-notification-sync.ts`
  (auth+bundle-gated hook, injectable `NotificationPort`, lazy convex singleton, swallow errors, triggers
  mount/focus/signal); add `deviceId` to `SyncBundle` (store-context.tsx); mount `useNotificationSync()`
  in App.tsx after `useReconciler()`. Dispatch: Sonnet TDD executor (pure derive tests + hook test
  mirroring use-reconciler.test.tsx) → fresh-context Opus reviewer (verify #1 reads-local/write-only,
  #2 direct-call exception, #5 reuse-engine, #7 submit+suppress-only) → PR "Closes #135". No deploy gate
  (no schema/cron change). **Next after 16c: 16d (mobile, device-bound) closes umbrella #16.**
  <!-- 16b MERGED note retained below for trail -->
- **Unit 16b MERGED (2026-06-29) — PR #134 (squash `3968af1`, branch deleted), Issue #133 closed.** Convex
  notification server live on dev `necessary-warbler-246`: 3 owner-scoped tables (`pushDevices` w/ `hasToken`
  bool, `notificationIntents`, `notificationLedger`, 5 indexes) + official `@convex-dev/expo-push-notifications@0.3.1`
  component installed + "notification push sweep" 5-min cron registered (USER deploy gate cleared — indexes added,
  component installed, functions ready; codegen confirmed faithful to executor's hand-edit). `notifications.ts`:
  pure `electPrimaryDevice` + `registerDevice`/`submitIntent`/`claimSlot`/`getNotificationState` + internal
  `runDueSweep` (send runs INSIDE the claim mutation = atomic race-free at-most-once; `(owner,dedupeKey)` ledger
  insert is the single #7 enforcement point). 26 new convex tests; typecheck 9 / test 6 / lint 6 green. Fresh-context
  Opus review APPROVE (confirmed #7 race-free, #5 no-core-import, ownership isolation, no raw-token leak). Imports
  NO `@ember/core`. **Next: umbrella #16 has 16c (web wiring) + 16d (mobile, device-bound) left.** (Remaining overall
  backlog: #16 16c/16d, #17 settings, + two deferred claim-review client units.)
  <!-- 16b SPECCED note retained below for trail -->
- **Unit 16b SPECCED + DISPATCH-READY (2026-06-29) — Issue #133 (umbrella #16, second slice), branch
  feat/133-convex-notification-server, spec specs/16b-convex-notification-server.md. Route standard** (one
  boundary `convex/`, well-trodden Convex fn/schema/cron; **one new dep: official
  `@convex-dev/expo-push-notifications@0.3.1` component** (user direction 2026-06-29 — owns token
  storage/batching/retry/receipts/dead-token cleanup; replaces hand-rolled raw `fetch`); no
  core/store/apps change; imports NO `@ember/core`). The dumb arbiter+relay enforcing invariant #7.
  **Forks resolved with user (2026-06-29):** (1) **client decides, server relays+dedupes** — 16a engine
  runs on-device (16c/d), client submits its `selected` plan as an *intent*, server schedules/relays +
  dedupes only (keeps decision single-sourced per #5; preserves Convex's isolation from core, mirroring
  sync.ts's inline-LWW); (2) **Expo push only (mobile)** — web rides local-scheduled + shared ledger, no
  VAPID; (3) **most-recently-active device wins** election (tie-break deviceId); (4) suppress-if-read is
  client-driven via `claimSlot('local'|'suppressed')`. 16b deliverables (all `convex/`): schema += 3
  owner-scoped tables `pushDevices`(now `hasToken` bool, raw token lives in component)/`notificationIntents`/`notificationLedger`
  (5 indexes); new `convex/convex.config.ts` registers the component; `notifications.ts`
  = pure `electPrimaryDevice` + `registerDevice` (upsert + `push.recordToken`)/`submitIntent`/`claimSlot`/`getNotificationState` +
  internal `runDueSweep` (transactional: due-scan → election → ledger claim → mark sent/cancel siblings →
  `push.sendPushNotification(deviceId)`, skips stale>2h & already-claimed, leaves web-only pending — the
  send runs INSIDE the mutation so claim+queue commit atomically; no separate action). `crons.ts` 5-min
  → `runDueSweep`. `claimSlot`'s `(owner, dedupeKey)` ledger insert is the single #7 enforcement point
  (serializable txn = race-free). Server `Date.now()` allowed (no-Date.now() is a core-purity rule only).
  Dispatch: Sonnet TDD executor (convex-test, register the push component; `sendPushNotification` is the
  un-headless seam — assert ledger/intent state) → fresh-context Opus reviewer (verify
  #1/#2-exception/#5-no-core-import/#7-single-claim + ownership isolation) → **USER deploy gate**
  (`npx convex dev --once` installs component + pushes 3 tables + registers cron to dev
  necessary-warbler-246, like 11a/12a/13a) → PR "Closes #133". Deferred to 16c/16d: client engine wiring, local scheduling, permission
  UX, token registration, device-bound acceptance; #17: quiet-hours/enabled-types/explicit-primary overrides.
  <!-- 16a MERGED note retained below for trail -->
- **Unit 16a MERGED (2026-06-29) — PR #132 (squash `078fc41`, branch deleted), Issue #131 CLOSED; CI
  `verify` green on head. FIRST slice of umbrella #16 done — pure core notification-decision engine.**
  Standard route ran fully: Sonnet TDD executor built `packages/core/src/notification.ts`
  (planNotifications → {candidates, selected} = single highest-priority plan / ≤1-per-day cap +
  learnBestHour + NotificationConfig/DEFAULT_NOTIFICATION_CONFIG) + tests → fresh-context Opus review =
  **APPROVE-WITH-NITS, no blockers** (purity #1, spec fidelity, both tz signs hand-checked, #7 dedupeKey,
  boundary all confirmed file:line); applied the one substantive nit (mislabeled lapse-only test now
  pushes best-time out of the quiet window so lapse-reengage is the genuine sole survivor + asserts type).
  4 types (streak-risk > goal-progress > best-time > lapse-reengage), quiet-hours [8,22) filter, best-time
  = modal recent-session hour + default fallback; reuses deriveStreak/deriveTodayGoal/localDayOf, caller
  supplies now/tz (no Date.now()). `dedupeKey = ${type}:${localDay}` is the per-(type,day) key 16b's
  server ledger dedupes (engine does NO cross-device election). Final green: **typecheck 9 · core test
  450 (+18) · lint 6.** No store/convex/apps change, no new dep, no deploy gate. **Next: 16b — Convex
  scheduled push + delivery ledger + primary-device election (invariant #7), keyed on 16a's `dedupeKey`.**
  (Remaining umbrella backlog: #16 (16b/16c/16d left), #17 settings, + two deferred claim-review client
  units.) <!-- 16a SPEC note retained below for trail -->
- **Unit 16a SPECCED + DISPATCH-READY (2026-06-28) — Issue #131 (umbrella #16, first slice), branch
  feat/131-core-notification-engine, spec specs/16a-core-notification-engine.md. Route standard** (one
  boundary `packages/core`, pure TS, no new dep, no UI; no store/convex/apps change — no syncable record
  added here). Umbrella **#16 (Notification engine) SCORED COMPLEX → split by boundary** like 13/14/15:
  **16a** pure core decision engine → **16b** Convex scheduled push + delivery ledger + primary-device
  election (invariant #7) → **16c** web wiring → **16d** mobile wiring (expo-notifications, device-bound).
  **Product forks resolved with user (2026-06-28):** (1) four types — streak-risk, best-time daily nudge,
  goal-progress, re-engagement-after-lapse; (2) best-time = **modal start-hour over recent sessions +
  fixed default fallback** (≥5 sessions, window 30, default 20:00); (3) guardrails = **quiet-hours window
  [8,22) + ≤1 nudge/local-day, priority-ordered** (streak-risk > goal-progress > best-time > lapse).
  16a deliverable (`packages/core/src/notification.ts` + barrel): pure `planNotifications(input)` →
  `{ candidates: NotificationPlan[]; selected }` (single highest-priority plan = the ≤1/day cap) +
  `learnBestHour` + `NotificationConfig`/`DEFAULT_NOTIFICATION_CONFIG`. Reuses `deriveStreak`/
  `deriveTodayGoal`/`localDayOf` (units 07/08); suppress-if-already-read derives from sessions; caller
  supplies `now`/`tz` (no `Date.now()`). `dedupeKey = ${type}:${localDay}` is the per-(type,day) key the
  **server delivery ledger (16b)** dedupes — engine does NOT do cross-device election. Settings
  persistence/sync defers to #17. Dispatch: Sonnet TDD executor → fresh-context Opus reviewer (verify #1
  core purity, no platform API/`Date.now()`, no store/convex change, dedupeKey shape) → PR "Closes #131".
  <!-- 15 COMPLETE note retained below for trail -->
- **Umbrella #15 COMPLETE (2026-06-28) — Library tagging + smart views shipped across core + web + mobile.**
  15a core model + evaluator (#126) → 15b web UI (#128) → 15c mobile UI (#130, Issue #129 CLOSED, squash
  `b54083f`). Umbrella issue #15 closed. Post-merge fix: `bg-tag-*` were tree-shaken on RN (dynamic
  `TAG_BG[color]` index) → force-emitted via `@source inline` in `apps/mobile/global.css`; promoted to a
  durable **invariant #6 corollary** in architecture.md (any dynamically-indexed mobile token class needs the
  safelist map *and* an `@source inline` line; only device-bound acceptance catches it). **Next: pick the next
  umbrella from the backlog** (#16 notifications, #17 settings, + two deferred claim-review client units).
  <!-- 15c review/dispatch detail below for trail -->
- **(specced+dispatched) Unit 15c — Issue #129, branch feat/129-mobile-library-tags-smart-views, spec specs/15c-mobile-library-tags-smart-views.md. Route standard.**
  THIRD/final slice of #15 — mobile (Expo RN / uniwind) Library tagging + smart-view UI, a **device-bound
  mirror of the merged 15b** (the 14b→14c precedent). Consumes 15a's pure model; adds NO core logic; **no
  packages/tokens change** (15b already put `--color-tag-*` in theme.uniwind.css); no store/convex change; no
  new runtime dep. Mirrors 15b into `native-store.ts` (same 9 methods, inline put+enqueue / delete-tombstone
  like `saveDuplicateDecision`, invariant #2), `use-library-tags.ts` (tagsByDoc orphan-drop + `LibraryEntry[]`
  on canonical set, all filtering via `evaluateSmartView` — invariant #5), and RN UI (horizontal pill
  smart-view bar reusing the ThemeControl accent-underline idiom; row tag chips as RN Pressables w/
  stopPropagation + real a11y controls; `tag-picker` as an RN `Modal` mirroring `annotation-editor`; `bg-tag-*`
  safelist, invariant #6). **UI unit → frontend-design + impeccable before code-review.** **Forks inherited
  from 15b (not re-litigated):** horizontal filter bar; tag delete tombstones the tag, links/view-tagIds go
  inert at resolve-time (lazy, no fan-out). **Mobile vitest = node env (no jsdom/RN renderer):** tests are
  store + pure-logic/props-contract only; visual/interaction is **device-bound acceptance** (like 14c / 02d).
  Next: dispatch (Sonnet TDD executor → fresh-context Opus review → PR `Closes #129`). Umbrella #15 COMPLETE
  on merge. <!-- 15b/15a notes below for trail -->
- **Unit 15b MERGED (2026-06-28) — PR #128 (squash `6fe9875`, branch deleted), Issue #127 CLOSED; CI `verify`
  green.** SECOND slice of #15 — web Library tagging + smart-view UI, consuming 15a's merged pure model
  (NO core logic added; no store/convex change; no new runtime dep). Standard route ran fully: Sonnet TDD
  executor built tokens + 9 `web-store` methods (inline put+enqueue / delete-tombstone, invariant #2) +
  `use-library-tags` hook (tagsByDoc orphan-drop + `LibraryEntry[]` on canonical set, all filtering via
  `evaluateSmartView` — invariant #5) + UI (smart-view filter bar, row tag chips w/ pointer-events pattern,
  Popover+Command tag-picker; shadcn Popover/Command/DropdownMenu/AlertDialog vendored + token-mapped,
  invariant #6) + store/hook/UI tests → frontend-design + impeccable for the net-new UI → **fresh-context
  Opus review = APPROVE** (all graded invariants verified file:line; 3 non-blocking nits — prop name,
  header-count source, hex casing — all applied). Gates: typecheck 9/9 · web test 402/402 · lint clean.
  Shared `--color-tag-*` palette added to theme.css + theme.uniwind.css (forward-shared to 15c).
  Forks: (1) smart-view nav = horizontal filter bar; (2) tag delete tombstones the tag, links/view-tagIds
  go inert at resolve-time (lazy, no fan-out). <!-- 15a note below for trail -->
- **Unit 15a MERGED (2026-06-28) — PR #126 (squash `fe8c89a`, branch deleted), Issue #125 CLOSED; CI `verify`
  green on head. FIRST slice of umbrella #15 done — pure core tags + smart-views model.** Standard route ran
  fully: Sonnet TDD executor built all
  three modules + tests (hit a session limit before reporting gates) → I independently finished verification +
  fixed 4 trivial gate issues the executor didn't reach (3× `exactOptionalPropertyTypes` explicit-`undefined`
  in test fixtures/`deriveReadingState` call → omit-the-prop; import-order autofix) → fresh-context Opus review =
  **APPROVE, zero blockers/should-fixes** (#1 core-purity, #2 encoded-HLC `updatedAt`, #5 single evaluator,
  arch:76 union-by-UUID, boundary all confirmed file:line; re-ran all gates). Applied both optional nits:
  defensive `{ ...query }` copy in make/editSmartView (immutability), hoisted the duplicated `Set` in
  `evaluateSmartView`. Delivered (all `packages/core/src`): `tag.ts` (Tag + makeTag/editTag + normalizeTagName/
  tagDedupeKey + TagColor palette), `doc-tag.ts` (deterministic `docTagId`=`${docId}:${tagId}`, union-merge
  inherent), `smart-view.ts` (SmartView + SmartViewQuery + BUILT_IN_SMART_VIEWS constants + pure
  `deriveReadingState` + `evaluateSmartView`), barrel. Final green: **typecheck 9 · core test 407 (18 files,
  +72: tag 24 / doc-tag 10 / smart-view 52) · web 372 · lint 6.** Three new syncable collections (`tags`/
  `doc-tags`/`smart-views`) ride 12a's generic push/pull — no store/convex/apps change, no new dep, no deploy
  gate. **Next: 15b (web Library tagging + smart-view UI) — drives 15a's evaluator inside `apps/web`; writes
  tag/link/view records through the outbox. UI unit → frontend-design + impeccable before review.** (Remaining
  umbrella backlog: #15 (15b/15c left), #16 notifications, #17 settings, + two deferred claim-review client
  units.) <!-- 15a SPEC note retained below for trail -->
- **Unit 15a SPECCED + DISPATCH-READY (2026-06-27) — Issue #125 (umbrella #15, first slice), branch
  feat/125-core-tags-smart-views, spec specs/15a-core-tags-smart-views.md. Route standard** (one boundary
  `packages/core`, pure TS, no new dep, no UI; three new syncable collections ride 12a's generic push/pull —
  no store/convex change). Umbrella **#15 (Tags + smart views) SCORED COMPLEX → split by boundary** like
  03/04/11/12/13/14: **15a** core model + evaluator → **15b** web Library tagging/smart-view UI → **15c**
  mobile (device-bound). **Product forks resolved with user (2026-06-27):** (1) tag model = **entity
  (`tags`) + UUID-keyed link records (`doc-tags`)** — global rename/recolor propagates, union-merge per
  arch:76 — NOT a string array; (2) smart views = **user-defined syncable saved views (`smart-views`)**,
  built-ins ship as constants. 15a deliverables (all `packages/core/src`, pure): `tag.ts` (Tag + makeTag/
  editTag + normalizeTagName/tagDedupeKey + TagColor palette), `doc-tag.ts` (deterministic `docTagId` =
  `${docId}:${tagId}` link, union-merge inherent), `smart-view.ts` (SmartView record + SmartViewQuery +
  BUILT_IN_SMART_VIEWS constants + pure `deriveReadingState` + `evaluateSmartView`), barrel exports. All
  records mirror annotation.ts factory/edit pattern (encoded-HLC `updatedAt`, caller supplies id/time/hlc);
  LWW-converge via existing pipeline. No new dep, no deploy gate. Dispatch: Sonnet TDD executor →
  fresh-context Opus reviewer (verify #5 single evaluator + #2 encoded-HLC updatedAt + #1 core purity + no
  store/convex change + arch:76 union-by-UUID) → PR "Closes #125". Deferred to 15b/15c: all UI + outbox
  writes (`repo.put(make…)` / `repo.delete` for untag), tag-color→token mapping. <!-- 14c MERGED note retained below for trail -->
- **Unit 14c MERGED (2026-06-27) — PR #124 (squash `3d16a81`, branch deleted), Issue #123 CLOSED. THIRD &
  final planned slice of umbrella #14 done — mobile duplicate-merge UI.** Device-bound RN mirror of 14b inside
  `apps/mobile` only (no `packages/*`, `convex/`, or `apps/web` change; no new dep — `duplicate-decisions` rides
  12a's generic push/pull). Delivered (all `apps/mobile/src`): `store/native-store.ts` += `listDuplicateDecisions`
  + inline `saveDuplicateDecision` (one shared `clock.nextStamp()` → one `repo.put` + one `makeOutboxEntry`
  enqueue, `entry.hlc === updatedAt`, mirrors `createAnnotation`); `library/use-duplicates.ts` (detect over
  **canonical docs only**, default canonical = larger byteSize, session dismiss); `library/use-library.ts`
  alias-hide; `library/duplicate-prompt.tsx` (uniwind token-only card, `text-on-accent` Merge CTA, RN
  radiogroup/radio + accessibilityState keep-which selector à la `ThemeControl`, ≥44pt targets, no native Alert);
  `library/library-screen.tsx` mounts it in the FlatList `ListHeaderComponent` below `ImportCard`;
  `today/select-continue-reading.ts` + `use-continue-reading.ts` alias-collapse (new `decisions` arg defaults
  `[]` ⇒ existing callers green). Standard route ran fully: Sonnet TDD executor → I independently re-verified the
  diff+gates (executor tool-count looked low) → fresh-context Opus review = **APPROVE, zero blockers** (#2/#5/#6
  + boundary confirmed file:line); one cosmetic nit fixed (dropped redundant `mx-4 mb-4` double-inset vs sibling
  cards). Final green: typecheck 9 · mobile test 35 files/314 · lint 6; CI `verify` green on head.
- **🎉 UMBRELLA #14 — all three planned slices MERGED (14a engine · 14b web · 14c mobile).** The near-duplicate
  merge/keep-separate conflict layer now ships across core + both clients, all through the single shared engine
  (invariant #5). **Issue #14 kept OPEN** because its body covers two UI surfaces deliberately deferred out of
  the duplicate-merge scope (user decision 2026-06-27): (1) **account-claim review-before-commit screens** (web +
  mobile — the pure `planClaimMerge` planner shipped in 14a, but the review UI is its own later unit per client);
  (2) **per-file/global conflict-policy settings screen** (the `conflict-policy` engine + `applyPull` policy arg
  shipped in 14a, but the settings UI = **unit 17**). No unit is in flight — awaiting the user's next directive.
  (Remaining umbrella backlog: #15 tags/smart-views, #16 notifications, #17 settings, + the two deferred
  claim-review client units.)
- **Unit 14b MERGED (2026-06-27) — PR #122 (squash `029be90`, branch deleted), Issue #121 CLOSED. Second
  slice of umbrella #14 done — web duplicate-merge UI.** Drives 14a's pure engine for the near-duplicate case
  inside `apps/web` only (no `packages/*`, no `convex/`, no new dep — the `duplicate-decisions` collection rides
  12a's generic push/pull). Delivered (all `apps/web/src`): `store/web-store.ts` += `listDuplicateDecisions` +
  `saveDuplicateDecision` (one `repo.put` + one HLC-stamped outbox entry, `entry.hlc === payload.updatedAt`,
  mirrors `saveReadingPosition`); `library/use-duplicates.ts` (surfaces undecided pairs over **canonical docs
  only** via `resolveCanonicalId`, default canonical = larger byteSize, session-only dismiss); `library/use-library.ts`
  alias-hide; `today/select-continue-reading.ts` alias-collapse (new `decisions` arg defaults `[]` ⇒ existing
  callers green); `library/duplicate-prompt.tsx` (token-only inline card, `on-accent` Merge CTA, radio keep-which
  selector, a11y radiogroup/aria-checked/≥44px/focus-visible, no AlertDialog — reversible). **Scope decision
  (user 2026-06-27):** 14b = duplicate-merge only; the **claim-review screen** is sliced to its own later web
  unit; policy **settings** = unit 17. Standard route ran fully: Sonnet TDD executor → fresh-context Opus review
  = **APPROVE, zero blockers** (#2 exactly-once outbox + #5 single engine + #6 token-only + boundary all confirmed
  file:line); one review nit hardened (detect over canonicals only, so a merged alias can't surface a fresh
  prompt vs a third near-dup). Final green: typecheck 9 · web test 50 files/372 · lint 6; CI `verify` green on
  head. **Next: 14c (mobile duplicate-merge UI, device-bound RN mirror of 14b) — last slice of umbrella #14.**
  (Remaining umbrella backlog: #14 (14c left), #15 tags/smart-views, #16 notifications, #17 settings +
  deferred claim-review web unit.) <!-- 14a MERGED note retained below for trail -->
- **Unit 14a MERGED (2026-06-27) — PR #120 (squash `9747e41`, branch deleted), Issue #119 CLOSED. First
  slice of umbrella #14 done.** The pure core conflict engine: near-dupe detection (`duplicate-detection.ts`),
  syncable duplicate-decision + canonical resolver (`duplicate-decision.ts`), global/per-doc position policy
  (`conflict-policy.ts`) threaded through `applyPull`'s additive 3rd arg (defaults `'furthest'` ⇒ 12b
  byte-identical; `'latest'` → LWW) via `reconcile.ts`, and the review-before-commit `planClaimMerge`
  (`claim-merge.ts`). New collections ride 12a's generic push/pull — no store/convex change. Invariants
  #5/#2/#1 held. TDD (Sonnet) → fresh-context Opus review (APPROVE, zero blocking; `normalizeTitle`
  extension-allowlist nit fixed). **CI gotcha logged:** the reconcile change added two `store.get` reads on
  the reading-positions fold; mobile's `sync-scheduler` e2e test drained a fixed 8 microtasks via `flush()`
  and read the outbox before the furthest-page corrective enqueued — local turbo served a stale mobile cache
  so it only surfaced on CI. Fixed by `Promise.all`-ing the policy reads + widening `flush()` to 24. Final
  green: core 321 · mobile 284 · web 339 · store 108 (+convex) · typecheck 9 · lint 6. **Next: 14b (web
  conflict UI) — inline duplicate prompt, claim-review screen, policy-aware library/reader wiring; UI unit →
  frontend-design + impeccable before review.** (Remaining umbrella backlog: #14 (14b/14c left), #15
  tags/smart-views, #16 notifications, #17 settings.)
- **Unit 14a SPECCED + DISPATCHED-READY (2026-06-26) — Issue #119 (umbrella #14, first slice), branch
  feat/119-core-conflict-merge-engine, spec specs/14a-core-conflict-merge-engine.md. Route standard**
  (one boundary `packages/core`, pure TS, no new dep, no UI; new syncable collections ride 12a's generic
  `push`/`pull` — no store/convex change). Umbrella **#14 (Conflict-resolution UI + claim merge) SCORED
  COMPLEX → split by boundary** like 03/04/11/12/13: **14a** core conflict engine → **14b** web conflict UI
  → **14c** mobile conflict UI (device-bound). **Product forks resolved with user (2026-06-26):** (1)
  conflict trigger = **near-duplicate detection** (different SHA + equal normalized title + byte size in
  band; identical bytes already auto-merge per #5); (2) account claim = **review-before-commit** (14a ships
  a pure planner, not an auto-fold); (3) **14 = engine + inline prompts** — the global/per-file policy
  **settings screen defers to unit 17**. 14a deliverables (all `packages/core/src`, pure): `duplicate-detection.ts`
  (`normalizeTitle`/`detectDuplicates`), `duplicate-decision.ts` (syncable `duplicate-decisions` record +
  `resolveCanonicalId` chain-resolver), `conflict-policy.ts` (syncable `conflict-policy` record `furthest|latest`,
  global + per-doc) + a backward-compatible 3rd `policy` arg on `applyPull` (defaults `'furthest'` ⇒ all 12b
  tests unchanged) wired via `reconcile.ts`, `claim-merge.ts` (`planClaimMerge` → review payload). No new dep,
  no deploy gate. Dispatch: Sonnet TDD executor → fresh-context Opus reviewer (verify #5/#2/#1 + no store/convex
  change + applyPull default-furthest unchanged) → PR "Closes #119". Deferred to 14b/14c: inline duplicate
  prompt, claim-review screen, policy-aware library/reader wiring. <!-- prior MERGED note retained below -->
- **🎉 UMBRELLA #13 COMPLETE (2026-06-26) — encrypted cross-device blob sync wired end-to-end across all three layers:
  13a Convex file-storage server → 13b core blob-sync engine → 13c web wiring → 13d mobile wiring. All four slices
  merged; umbrella issue #13 CLOSED.** Client-side symmetric (non-ZK) encryption at rest, eager background download,
  keep-local-on-over-limit, server-authoritative caps (50 MB/file, 1 GB/user). Invariants #1/#2/#5/#6 held throughout.
  No next unit queued — awaiting the user's next directive. (Remaining umbrella backlog: #14 conflict-resolution UI,
  #15 tags/smart-views, #16 notifications, #17 settings.)
- **Unit 13d MERGED (2026-06-26) — PR #118 (squash `ddab963`, branch deleted), Issue #117 closed; FINAL slice —
  umbrella #13 COMPLETE.** USER device-verified (two devices, same account: import→badge live Syncing…→synced,
  eager-download on device B, >50 MB ⇒ "kept on this device" excluded from quota, over-quota ⇒ Try-again). CI `verify`
  green on head. Standard route ran fully: Sonnet TDD executor (orchestrator finished gate fixes after a subagent
  session limit) → impeccable a11y pass (`36cb82b`: RN single-element-row — status folded into row accessibilityLabel,
  retry via accessibilityActions + ≥44pt hit target, long-copy constrained, meter value percentage-based) →
  fresh-context Opus review = **APPROVE-WITH-NITS, no blockers** (all invariants #1/#2/#5/#6 + no-package-change
  confirmed file:line) → nit fixed (`8feb3f2`: crypto parity pinned to an independent Node-crypto AES-GCM vector,
  test 4c). Throwaway dev screen removed post-verify (`62d8942`). Delivered (all `apps/mobile/src`):
  `store/native-crypto-box.ts` (AES-256-GCM via @noble/ciphers 2.2.0, IV‖ct‖tag byte-compatible w/ web Web Crypto;
  loadBlobKey via base64ToBytes), `sync/convex-blob-transport.ts` (storageId/URLs stay in binding),
  `sync/use-storage-usage.ts`, pure `sync/blob-sync-scheduler.ts` + thin `sync/use-blob-sync.ts` (12d
  pure-scheduler/thin-hook split), `sync/blob-sync-context.tsx` (threads retryDeferred), `SyncBundle` +=
  blobs/blobStatus/blobChange, `native-store.ts` += listBlobStatuses(), `library/use-library.ts` join + blobChange
  subscribe, `document-row.tsx` badge, `library/storage-meter.tsx`, `app/_layout.tsx` mounts useBlobSync({fileCap})
  once. Both 13c refinements carried (over-cap pre-skip + blobChange live refresh). Final gate: **typecheck 9 ✓ ·
  mobile test 32 files/284 ✓ · lint 6 ✓.** New dep @noble/ciphers 2.2.0 (pure JS). No core/store/convex change,
  no deploy gate. <!-- 13d BUILT/IN-REVIEW note retained below for trail -->
- **Unit 13d BUILT — IN REVIEW / awaiting USER device-verify (2026-06-26) — Issue #117, branch
  feat/117-mobile-blob-sync-wiring, PR #118 "Closes #117".** Sonnet TDD executor built it end-to-end (executor hit a
  session limit before reporting; orchestrator finished the gate fixes: exactOptionalPropertyTypes spreads on
  DocumentRow/SyncBadge props, `DimensionValue` cast on the meter width, `as unknown as` on the transport-test client
  cast, conditional `fileCap` opt, lint --fix + manual unescaped-quote/unused-import fixes). Delivered (all
  `apps/mobile/src`): `store/native-crypto-box.ts` (AES-256-GCM via @noble/ciphers, IV‖ct‖tag byte-compatible w/ web
  Web Crypto; loadBlobKey via base64ToBytes), `sync/convex-blob-transport.ts`, `sync/use-storage-usage.ts`, pure
  `sync/blob-sync-scheduler.ts` + thin `sync/use-blob-sync.ts`, `SyncBundle` += blobs/blobStatus/blobChange,
  `native-store.ts` += listBlobStatuses(), `library/use-library.ts` join + blobChange subscribe, `document-row.tsx`
  badge, `library/storage-meter.tsx`, `app/_layout.tsx` mounts useBlobSync({fileCap}) once + `sync/blob-sync-context.tsx`
  threads retryDeferred to LibraryScreen. Both 13c refinements carried (over-cap pre-skip + blobChange live refresh).
  Throwaway `app/dev/blob-sync-13d.tsx` verify screen (delete before merge). **Gate green: typecheck 9 ✓ · mobile test
  32 files/283 ✓ (4 new: native-crypto-box, convex-blob-transport, blob-sync-scheduler, native-store-blob-status) ·
  lint 6 ✓.** New dep @noble/ciphers 2.2.0 (pure JS). No core/store/convex change, no deploy gate.
  **Impeccable a11y pass DONE (`36cb82b`):** RN single-element-row issue — folded sync status into the row
  accessibilityLabel (badge text was never announced), exposed over-quota retry via accessibilityActions, gave
  "Try again" a real ≥44pt hit target (was ~16px), constrained long badge copy, meter accessibilityValue now
  percentage-based. **Fresh-context Opus review DONE = APPROVE-WITH-NITS, NO blockers:** all invariants #1/#2/#5/#6
  + no-package-change confirmed with file:line; gates re-run green (typecheck 9 / mobile 283 / lint 6). Review nit
  addressed (`8feb3f2`): crypto cross-device parity now pinned to an independent Node-crypto AES-GCM vector (test 4c),
  mobile test now 32 files/284. **Remaining before merge:** (1) delete throwaway `app/dev/blob-sync-13d.tsx` + its
  `app/dev/index.tsx` entry (kept for now so USER can device-verify); (2) **USER device-verify** (two devices, same
  account): import→badge Syncing…→synced live; eager-download on the other device; >50 MB ⇒ "kept on this device",
  excluded from quota; over-quota ⇒ "Storage full" + Try-again. On merge: Issue #117 closes, **umbrella #13 COMPLETE**.
  <!-- 13d SPEC note retained below for trail -->
- **Unit 13d SPECCED + DISPATCHED (2026-06-26) — Issue #117 (umbrella #13, final slice), branch
  feat/117-mobile-blob-sync-wiring, spec specs/13d-mobile-blob-sync-wiring.md. Route standard** (one boundary
  `apps/mobile`; all forks resolved). **Device-bound + UI unit.** Mobile mirror of 13c — wires 13b's `reconcileBlobs`
  to the deployed 13a server inside the mobile app. **Fork resolved with user (2026-06-26): mobile AES-256-GCM via
  `@noble/ciphers` (pure JS)** — RN has no `crypto.subtle` and expo-crypto can't do symmetric ciphers; pure-JS lib
  avoids the SDK-56 native-pin risk (02d) and matches the hand-rolled-base64 ethos. IV(12) from
  `expo-crypto.getRandomBytes`, layout `IV ‖ ciphertext ‖ tag` byte-compatible with web's Web Crypto ⇒ cross-device
  decrypt works. Deliverables (all `apps/mobile/src`): `store/native-crypto-box.ts`, `sync/convex-blob-transport.ts`,
  `sync/use-storage-usage.ts`, pure `sync/blob-sync-scheduler.ts` + thin `sync/use-blob-sync.ts` (the 12d
  pure-scheduler/thin-hook split, node-testable), `SyncBundle` += `blobs`/`blobStatus`/`blobChange`, `native-store.ts`
  += `listBlobStatuses()`, `library/use-library.ts` doc⨝status join + blobChange subscribe, `document-row.tsx` badge +
  `storage-meter.tsx`, `app/_layout.tsx` mounts `useBlobSync({fileCap})`. **Both 13c refinements carried:** (#1)
  over-cap pre-skip in the scheduler, (#2) local `blobChange` UI-refresh signal so badges update without remount.
  New dep `@noble/ciphers` (pure JS, npm — not expo install). No core/store/convex change, no deploy gate. Dispatch:
  Sonnet TDD executor → frontend-design + impeccable (badge/meter) → fresh-context Opus reviewer. Throwaway
  `app/dev/blob-sync-13d.tsx` device-verify screen. **USER device-verify before merge** (two devices, same account):
  import→sync→eager-download on the other device; >50 MB ⇒ "kept on this device", excluded from quota. On merge:
  Issue #117 closes, **umbrella #13 COMPLETE**. <!-- 13c MERGED note retained below for trail -->
- **Unit 13c MERGED (2026-06-26) — PR #116 (squash `e716bcf`, branch deleted), Issue #115 closed; umbrella #13
  — only 13d (mobile wiring) remains.** USER browser-verified (two profiles, same account). Standard route ran
  end-to-end (executor → frontend-design → impeccable → fresh-context Opus reviewer APPROVE-WITH-NITS). Two
  post-review refinements landed on the same PR during browser-verify, both to carry into **13d**:
  1. **Over-cap pre-skip** (`007032f`) — the web scheduler pre-marks any doc whose local `byteSize` > server
     `fileCap` as `deferred`/`over-file-cap` and excludes it from `candidateIds`, so we never encrypt+upload a
     file the server will reject (even on a retryDeferred pass). `fileCap` flows from `useStorageUsage()` →
     `useBlobSync({fileCap})`. Engine stays size-agnostic (byteSize lives in the doc record, not BlobBytes);
     server stays authoritative for the boundary band.
  2. **Live badge refresh** (`a253fb7`) — blob-status writes go through repo.put/delete with NO outbox enqueue
     (invariant #2), so the reconciler wake `signal` never fired for them and a row stayed "Syncing…" until the
     page remounted. Added a dedicated local UI-refresh signal `SyncBundle.blobChange` the blob-sync scheduler
     fires after every pass; `useLibrary` subscribes + re-reads. Purely local — no enqueue, never pushed — so #2
     holds; no-op when no production bundle (injected-store tests). **13d's mobile library must wire an equivalent.**
  Final gate: **typecheck 9 ✓ · web test 46 files/339 ✓ · lint 6 ✓**; CI `verify` green on head. No core/store/
  convex package change, no new dep. **Next: 13d — mobile blob-sync wiring (device-bound).** <!-- 13c IN-REVIEW note retained below -->
- **Unit 13c BUILT — IN REVIEW / awaiting USER browser-verify (2026-06-26) — Issue #115, branch
  feat/115-web-blob-sync-wiring, PR "Closes #115".** Standard route ran end-to-end: Sonnet TDD executor →
  impeccable pass (token-only fix: near-limit meter uses `streak-lit` token not raw amber; `use-storage-usage`
  gated via `useConvexAuth`+`'skip'` — no try/catch around a hook; DocumentRow restructured to overlay pattern
  so the over-quota "Try again" is no longer an invalid nested `<button>`) → fresh-context Opus reviewer
  **APPROVE WITH NITS** (no blocking; all invariants #1/#2/#5/#6 + core purity + storageId/URL encapsulation
  PASS; nits: double dynamic-import collapsed; `Id<'_storage'>` cast kept as `as any` since dataModel isn't an
  exported subpath of @ember/convex — staying inside the apps/web boundary). Gate green: **typecheck 9 ✓ ·
  web test 46 files/337 ✓ · lint 6 ✓.** No core/store/convex package change, no new dep. **Next:** USER
  browser-verify (two profiles, same account: import→sync→eager-download on other device; >50 MB ⇒ "kept on
  this device", excluded from quota) → merge → 13d (mobile wiring, device-bound). <!-- spec details retained below -->
- **Unit 13c SPECCED (2026-06-26) — Issue #115 (umbrella #13 open), branch feat/115-web-blob-sync-wiring,
  spec specs/13c-web-blob-sync-wiring.md. Route standard** (one boundary `apps/web`, no new dep — Web Crypto +
  `fetch` are platform built-ins, convex client exists; all umbrella forks resolved). **UI unit** → net-new quota
  meter + sync badges go through frontend-design → impeccable before code-review. Third slice of #13: wires 13b's pure
  `blob-sync` engine to the live 13a server inside the web app. Deliverables (all `apps/web/src`): `store/web-crypto-box.ts`
  (real `CryptoBox` — AES-256-GCM via `crypto.subtle`, 12-byte IV prepended; `loadBlobKey` fetches `getOrCreateBlobKey`
  once/session → non-extractable CryptoKey); `sync/convex-blob-transport.ts` (`BlobTransport` over `api.files.*` + `fetch`
  — **storageId/URLs stay inside the binding**); `sync/use-storage-usage.ts` (`useQuery(getStorageUsage)` → BlobLimits);
  `sync/use-blob-sync.ts` (scheduler mirroring use-reconciler — auth+bundle gated, candidateIds from `listDocuments`, runs
  13b `reconcileBlobs` on interval+import-signal+online/focus, eager download, **auto loop retryDeferred:false**, exposes a
  one-shot `retryDeferred()`); extend `SyncBundle` with `blobs`(OpfsBlobStore) + `blobStatus`(same repo); `web-store.ts`
  gains `listBlobStatuses()` (`repo.query(BLOB_SYNC_COLLECTION)` — read-only, no enqueue); UI: `library/storage-meter.tsx`
  (quota meter, token-only, aria) + per-row sync badge in DocumentRow via `use-library` doc⨝status join (deferred over-cap
  = "Too large — kept on this device"; over-quota = "Storage full — kept on this device" + Try-again; synced/pending).
  `App.tsx` calls `useBlobSync()`. **No core/store/convex package change, no new dep.** Invariants: #1 (bytes move
  in/out of LOCAL OpfsBlobStore only; reader stays local; eager bg download), #2 (blob metadata = direct authed transport
  call, NEVER enqueued; `blob-sync` status records written via repo.put/delete — no notify, local-only / never pushed —
  same as 12c cursor), #5 (content-addressed ⇒ zero merge logic), #6 (token-only UI). Tests (apps/web, vitest+jsdom):
  crypto round-trip/IV-uniqueness/tamper, transport mapping (fake client + mocked fetch), use-blob-sync (auth-gate, mount/
  interval/signal/online, offline-skip, overlap-coalesce, error-swallow, e2e on fakes, retryDeferred), use-library join,
  storage-meter render/aria. Dispatch: Sonnet TDD executor → frontend-design → impeccable → fresh-context Opus reviewer
  (verify #1/#2/#5 + core purity + no @ember/*/convex package change + storageId/URLs never leave binding + status never
  enqueued) → PR "Closes #115". **No deploy gate** (client wiring vs deployed 13a). **USER browser-verify before merge**
  (two profiles, same account): import→sync→eager-download on the other device; >50 MB ⇒ "kept on this device", excluded
  from quota. Next: 13d (mobile wiring, device-bound). <!-- prior MERGED note retained below for trail -->
- **Unit 13b MERGED (2026-06-26) — PR #114 (squash, branch deleted), Issue #113 closed; umbrella #13 still open
  (13c/13d remain).** CI `verify` green; Sonnet TDD executor → fresh-context Opus reviewer = CHANGES REQUESTED → fixed.
  **Blocker fixed:** `uploadBlob`'s local-missing-bytes path wrote a `deferred` status — a latent bug that would block a
  later legitimate upload of the same contentId once its bytes are imported (planner skips `deferred` unless
  `retryDeferred`); changed to a bare `{ok:false,'missing-upload'}` return + regression assertion. Built `blob-sync.ts`
  (types + `CryptoBox`/`BlobTransport`/`BlobBytes`/`BlobStatusStore` ports + `planBlobSync`/`uploadBlob`/`downloadBlob`/
  `forgetBlob`/`reconcileBlobs`) + 19 tests; executor named the driver's upload-candidate param `candidateIds` and added
  `delete` to `BlobStatusStore` (still structural — Repository satisfies it; no store change). typecheck 9 ✓ · test 267
  core (19 new) ✓ · lint 6 ✓. Invariants #1/#2/#5 + core purity intact. No new dep, no deploy gate.
  Next: 13c (web upload/download wiring + over-limit UX + quota indicator). <!-- spec note retained below for trail -->
- **Unit 13b SPECCED (2026-06-26) — Issue #113 (umbrella #13 open), branch feat/113-core-blob-sync-engine,
  spec specs/13b-core-blob-sync-engine.md. Route standard** (one boundary `packages/core`, pure TS, no new dep —
  crypto + transport are injected ports tested with in-memory fakes; all product forks resolved at the umbrella level).
  Second slice of #13. Scope (`packages/core` only): `blob-sync.ts` — the pure platform-free blob-sync engine 13c/13d
  drive. Result/limit types mirror 13a's return-union: `SaveBlobResult` ({ok:true} | {ok:false,code:over-file-cap|
  over-quota|missing-upload,...}) + `BlobLimits`. Structural ports (like 12b's sync-transport): `CryptoBox`
  (encrypt/decrypt opaque bytes — binding builds it from `getOrCreateBlobKey` + WebCrypto/expo-crypto; core stays
  key-agnostic), `BlobTransport` (upload/saveBlob/download/deleteBlob — **storageId + upload/download URLs stay inside
  the binding, never enter core**, exactly as 13a keeps storageId server-internal), `BlobBytes` (subset of store's
  BlobStore: has/get/put), `BlobStatusStore` (local-only per-contentId status; satisfied structurally by Repository,
  no store change). Functions: `planBlobSync` (pure partition → toUpload [local bytes not yet synced] / toDownload
  [synced docs not local]; `deferred` excluded unless `retryDeferred`), `uploadBlob` (encrypt→upload→saveBlob, branches
  on the return-union: ok⇒status `synced`, reject⇒status `deferred`+code, **never throws on a limit**), `downloadBlob`
  (download→decrypt→BlobBytes.put; null⇒skip), `forgetBlob` (deleteBlob + clear status, idempotent — tombstone GC),
  `reconcileBlobs` driver (plan→upload pending+download missing, **fail-soft per blob**: network fault⇒`failed` & continue,
  limit reject⇒`deferred` not `failed`; report {uploaded,downloaded,deferred,failed}). Local-only `blob-sync` status
  records (BLOB_SYNC_COLLECTION) **never enqueued / never pushed** — same pattern as 12b's `sync-meta` cursor. Invariants:
  #1 (engine only moves bytes in/out of LOCAL BlobStore; reads stay local; eager download is client-scheduled), #2 (blob
  metadata = direct authed transport call BY DESIGN, no outbox enqueue; document *record* still syncs via 12), #5 (blobs
  content-addressed by contentId=sha256 of plaintext ⇒ identical bytes=identical blob ⇒ zero merge logic). Core purity:
  no convex/@ember/store/platform-crypto/HTTP import — all injected. Tests (core, no @ember/store import): identity/XOR
  CryptoBox + Map-backed BlobBytes/BlobStatusStore + fake BlobTransport returning canned unions — planner partition,
  upload ok/each-reject-code/missing-bytes, download null-skip + decrypt round-trip, forgetBlob idempotent, reconcileBlobs
  e2e + fail-soft. Dispatch: Sonnet TDD executor → fresh-context Opus reviewer (verify #1/#2/#5 + core purity + no store
  change + storageId/URLs never in core) → branch/commit/PR "Closes #113". **No deploy gate** (pure core).
  Next: 13c (web upload/download wiring + over-limit UX + quota indicator).
- **Unit 13a MERGED (2026-06-26) — PR #112 (squash, branch deleted), Issue #111 closed; umbrella #13 still open.**
  USER deploy gate PASSED (`npx convex dev --once` → 2 tables/3 indexes live on dev necessary-warbler-246). Sonnet TDD
  executor → fresh-context Opus reviewer = APPROVE-WITH-NITS (no blockers, no invariant violation). Built `convex/files.ts`
  (6 fns) + `convex/files.test.ts` (23 tests) + `blobs`/`userKeys` in schema.ts. **Contract correction during build:**
  `saveBlob` rejects limits by **RETURNING `{ok:false, code}`, NOT throwing** — a Convex mutation is a transaction, so a
  throw would roll back the `ctx.storage.delete()` orphan-cleanup, leaking ciphertext forever. Returning lets cleanup
  commit; 13b/c/d branch on `result.ok`/`result.code` (codes over-file-cap|over-quota|missing-upload). Unauthenticated
  still throws. Spec + tests updated to match. Verify: typecheck 9 ✓ · convex test 36 ✓ (23 new) · lint ✓.
  **USER deploy gate before merge:** `npx convex dev --once` → push 2 tables/3 indexes to dev necessary-warbler-246.
  Next: 13b (core/store blob-sync engine + CryptoBox port + client crypto contract).
- **Unit 13a SPEC (2026-06-26) — original spec, route standard** (one boundary `convex/`, no new dep —
  convex-test already present; well-trodden Convex storage/fn logic; forks resolved). First slice of umbrella #13.
  Scope (`convex/` only): add `blobs` (owner·contentId·storageId·encryptedSize; by_owner_content/by_owner) + `userKeys`
  (owner·base64 AES-256-GCM key) tables to schema.ts; `convex/files.ts` with `FILE_CAP`(50 MB)/`USER_QUOTA`(1 GB)
  constants + 6 authed fns: `generateUploadUrl`, `saveBlob` (reads true ciphertext size via `ctx.db.system.get` →
  enforces per-file cap + per-user quota server-side, deletes the upload + throws typed `ConvexError`
  {over-file-cap|over-quota|missing-upload} on reject, upsert replaces+frees old storageId so re-upload doesn't
  double-count), `getDownloadUrl` (by contentId → url|null), `getOrCreateBlobKey` (mint-once escrow, non-ZK),
  `deleteBlob` (idempotent GC on tombstone), `getStorageUsage` (used/quota/fileCap for the indicator). **Key design:
  blobs addressed by `contentId`(=docId sha256 of plaintext, 04a), never by `storageId` on the client — `storageId`
  stays server-internal; NO change to `records`/`syncState` or the synced `Document` shape.** Ownership via
  `getAuthUserId` on every fn (throw if null), all rows owner-scoped. Invariants intact: #1 (storage off the read
  path — clients read LOCAL bytes; Convex only serves download URLs for eager background fetch), #2 (blob metadata is a
  direct authed storage call BY DESIGN, not an outbox mutation; the document *record* still syncs via 12 unchanged),
  #5 (no merge logic). Tests: convex-test (store blobs via `t.run(ctx=>ctx.storage.store(...))`), cover cap/quota
  reject+delete, replace-not-double-count, key mint-once, deleteBlob idempotent, usage accuracy, ownership isolation,
  unauth throws. Dispatch: Sonnet TDD executor → fresh-context Opus reviewer (verify #1/#2/#5 + no records/Document
  change + storageId never leaves server) → branch/commit/PR "Closes #111". **USER deploy gate before merge:**
  `npx convex dev --once` → push 2 tables/3 indexes to dev necessary-warbler-246 (gate class as 11a/12a).
  Next: 13b (core/store blob-sync engine + CryptoBox port + client crypto contract).
- **Unit 13 (File storage sync + quota) SCORED COMPLEX → split by boundary (2026-06-26)**, like 03/04/.../12. Needs 12
  (record sync) — purely additive cross-device BLOB sync on top of the merged 12 stack (blob storage exists locally on
  all three layers: store `BlobStore` port+`MemoryBlobStore`, web `OpfsBlobStore`, mobile `expo-file-system-blob-store`;
  zero Convex storage code / no `storageId` anywhere yet). Split (boundary-ordered, server→core→clients like 12a-d):
  **13a** Convex file-storage server (`convex/`) → **13b** core/store blob-sync engine + `CryptoBox` port + per-file-cap
  /quota types → **13c** web upload/download wiring + over-limit UX + quota indicator → **13d** mobile wiring
  (device-bound). **Product/architecture forks resolved with user (2026-06-26):** (1) **encryption at rest = client-side
  symmetric (non-ZK)** — Convex stores ciphertext + escrows a per-user AES-256-GCM key over the authed channel; full
  zero-knowledge E2E stays deferred (project-overview out-of-scope). (2) **download = eager background** — after each
  pull, devices background-download synced blobs not yet local. (3) **over-limit = keep local, skip upload** — an
  over-cap/over-quota file imports + stays fully readable offline (invariant #1), marked "not synced", upload retries
  when space frees; server rejects with a typed error, never truncates. (4) **limits = 50 MB/file, 1 GB/user**,
  server-authoritative.
- **🎉 UMBRELLA #12 COMPLETE (2026-06-26) — local-first sync stack fully wired end-to-end: 12a Convex sync server →
  12b core reconciler + conflict-merge fold → 12c web wiring → 12d mobile wiring. All four slices merged.** Both
  clients (web + mobile) now push their local outbox to Convex and pull+fold remote changes through the single shared
  `reconcile()`/`applyPull` engine, on an interval+lifecycle schedule, with Convex off the read path (invariant #1),
  outbox discipline (invariant #2), and ONE merge engine in packages/core (invariant #5). No next unit queued — awaiting
  the user's next directive.
- **Unit 12d MERGED (2026-06-26) — PR #110 (squash, branch deleted), Issue #109 closed; FINAL slice — umbrella #12
  COMPLETE.** CI `verify` green; reviewed fresh-context (Opus) **APPROVE, no blockers**. Device-bound mirror of 12c —
  wired 12b's `reconcile()` to the deployed 12a server
  inside the mobile app. Delivered (all `apps/mobile/src`): `store/native-clock.ts` +`receive(remote)`;
  `sync/{mutation-signal,with-mutation-notify,convex-sync-transport}.ts` (copied from 12c — flagged for future
  `@ember/store` dedupe); `sync/sync-scheduler.ts` — **pure, injectable, no platform imports** overlap-guarded
  trailing-coalescing loop (the testable core; mobile vitest is node env, no jsdom, `*.test.ts` only) with structural
  `AppStateLike`/`NetworkLike` ports + async `isOnline`; `sync/use-reconciler.ts` — thin `.ts` RN adapter wiring
  `AppState`(foreground)+`expo-network`(connectivity)+lazy convex singleton into the scheduler (intentionally untested
  glue, like `use-anonymous-auth`); `store/store-context.tsx` lifts repo+clock+signal into async init, exposes
  `SyncBundle` via `useSyncBundle()` (same repo + same clock back NativeStore and reconciler); `app/_layout.tsx` calls
  `useReconciler()` in the convex-gated, store-scoped `AnonymousAuthGate`. **Mobile design decision (not a fork):** pure
  scheduler + thin hook (forced by node test env; matches `reading-position-controller`/`session-tracker` convention).
  Triggers = interval(15s)+lifecycle (AppState active, network connected, debounced-after-mutation), fail-soft offline,
  `convex===null` ⇒ scheduler never mounts. `sync-meta`/`pull-cursor` in SQLite generic `records` table (no DDL);
  `SqliteRepository` satisfies structural `SyncStore`. Reviewed fresh-context (Opus) **APPROVE, no blockers**; gates
  fresh: typecheck 9 ✓ · test (mobile 254/28 files) ✓ · lint 6 ✓; overlap-guard non-concurrency proven (maxConcurrent===1),
  teardown + e2e push/pull/furthest-page-correction covered. Invariants #1/#2/#5 intact, zero merge logic in apps/mobile.
  No store/core/convex change, no new dep, **no deploy gate**.
- **Unit 12c MERGED (2026-06-26) — PR #108 (squash, branch deleted), Issue #107 closed; umbrella #12 still open
  (only 12d remains).** CI `verify` green; reviewed fresh-context (Opus) APPROVE-WITH-NITS, no blockers. Wired 12b's
  `reconcile()` to the live 12a server inside the web app. Delivered (all `apps/web/src`): `sync/convex-sync-transport.ts`
  (`SyncTransport` over `api.sync.push`/`pull`, pure pass-through); `store/web-clock.ts` +`receive(remote)` so WebClock
  backs a `ReconcilerClock`; `store/store-context.tsx` lifts repo+clock so the **same** repo + **same** clock back both
  WebStore and reconciler, exposed as `SyncBundle` via `useSyncBundle()` (null when store injected → tests skip prod
  instantiation; no convex import in store-context); `sync/with-mutation-notify.ts`+`mutation-signal.ts` wake the
  reconciler at the single `repo.enqueue` chokepoint; `sync/use-reconciler.ts` overlap-guarded trailing-coalescing loop
  gated on `isAuthenticated`+bundle, triggers = **interval(15s)+lifecycle** (auth-ready, focus/online, debounced-after-
  mutation), fail-soft offline; `App.tsx` calls `useReconciler()`. Executor deviation: **lazy** `import()` of the convex
  singleton (keeps the throwing module out of the App test graph; reviewer judged sound). Invariants #1/#2/#5 verified
  with file:line; overlap guard non-concurrency proven (test holds a `reconcile` open). typecheck 9 ✓ · test 308 (web 41
  files) ✓ · lint 6 ✓. No store/core/convex change, no new dep, **no deploy gate** (client wiring vs deployed 12a).
  Next: **12d** (mobile reconciler wiring, device-bound — RN AppState/NetInfo lifecycle; same ports, same `reconcile()`).
- **Unit 12c SPECCED (2026-06-26) — Issue #107, branch feat/107-web-reconciler-wiring,
  spec specs/12c-web-reconciler-wiring.md. Route standard** (one boundary `apps/web`, no new dep, no UI surface
  — the reconciler is a side-effect hook, no store/core/convex change, no deploy gate). Wires 12b's `reconcile()` to
  the live 12a server. Deliverables (all `apps/web/src`): `sync/convex-sync-transport.ts` (`SyncTransport` over
  `api.sync.push`/`pull`, pure pass-through — `OutboxEntry` ≡ push validator, pull row ≡ `RemoteEntry`); `store/web-clock.ts`
  +`receive(remote)` (core `receive`, persists `HLC_KEY`) so WebClock backs a `ReconcilerClock` adapter `{tick:nextStamp,
  receive}`; `store/store-context.tsx` lifts repo+clock creation so the **same** repo + **same** clock instance back both
  WebStore and reconciler (clock must be single — two over one localStorage diverge; repo must be shared — one outbox),
  exposed as a `SyncBundle` via `useSyncBundle()` (null when store injected → tests/jsdom skip prod instantiation, no convex
  import in store-context); `sync/with-mutation-notify.ts`+`sync/mutation-signal.ts` wake the reconciler at the single
  `repo.enqueue` chokepoint (covers all 7 mutators + future ones; reconciler's own furthest-page corrective enqueue also
  fires it → flushes the correction, monotone-join terminates); `sync/use-reconciler.ts` overlap-guarded trailing-coalescing
  loop gated on `isAuthenticated`+bundle, triggers = **interval(15s) + lifecycle** (auth-ready, window focus/online,
  debounced-after-mutation), fail-soft offline (skip when `!navigator.onLine`, `online` re-triggers; swallow transport
  errors); `App.tsx` calls `useReconciler()` next to `useAnonymousAuth()`. **Fork resolved with user (2026-06-26): sync
  trigger = interval+lifecycle** (rejected: Convex reactive `useQuery(pull)` cursor/effect dance; load-only minimal).
  `sync-meta`/`pull-cursor` is a normal record in Dexie's generic `[collection+id]` `records` table — verified, no schema
  change; `DexieRepository` already satisfies structural `SyncStore`. Tests (`apps/web/src/tests`, Vitest+jsdom): clock
  `receive` monotonicity, transport mapping (fake client), `with-mutation-notify` (notify only on enqueue), `use-reconciler`
  (auth-gate, auth-ready run, debounce, interval, overlap coalesce, offline skip + online retry, error swallow, e2e
  push/pull/correct via fake transport + MemoryRepository). Dispatch: Sonnet TDD executor → fresh-context Opus reviewer
  (verify #1/#2/#5 + no store/core/convex change + shared repo/clock) → branch/commit/PR "Closes #107". **No deploy gate**
  (client wiring vs already-deployed 12a). Next: 12d (mobile reconciler wiring, device-bound — RN AppState/NetInfo).
- **Unit 12b MERGED (2026-06-26) — PR #106 (squash, branch deleted), Issue #105 closed; umbrella #12 still open.**
  CI `verify` green; reviewed fresh-context (Opus) APPROVE-WITH-NITS, no blockers (non-resurrection comment nit applied).
  Delivered: `sync-transport.ts` ports, `apply-pull.ts` pure fold, `reconcile.ts` driver, `index.ts` barrel,
  24 tests (`tests/reconciler.test.ts`). typecheck 9 ✓ · test 248 (+24) ✓ · lint 6 ✓. No deploy gate (pure core).
  Spec specs/12b-core-reconciler-merge-fold.md. **Route standard** (one boundary `packages/core`
  + tests, no new dep, no UI, no client wiring; the lone fork resolved with user). Scope (`packages/core` only):
  the single shared conflict-merge engine (invariant #5) + the reconciler driving push/pull. Ports
  (`sync-transport.ts`): `SyncTransport` (push/pull), `RemoteEntry`, structural `SyncStore` (subset of
  `Repository` — core can't import store, store→core already), `ReconcilerClock`. Pure fold (`apply-pull.ts`):
  `applyPull(local, incoming) → PullDecision` — furthest-page for `reading-positions`, generic HLC-LWW otherwise
  (sessions insert-only/additive #3, docs idempotent). Driver (`reconcile.ts`): push-drain (`unacked`→`transport.push`
  →`ack`) then pull-fold (cursor→`transport.pull`→`applyPull`→local `put`/`delete`, advance clock via `receive`),
  cursor persisted as a **local-only** `sync-meta` record (never enqueued → never pushed; no `Repository`/store change).
  **Furthest-page lossiness fix — fork resolved with user (2026-06-25): "fold + corrective re-push" (CRDT join).**
  Pull runs `mergeReadingPosition`; when a local further page beats a **higher-HLC but lower** remote write, the driver
  re-stamps the winner with a fresh HLC (`clock.tick()`) + re-enqueues it so the Convex canonical converges **upward**
  (monotone → terminates), fixing brand-new devices too — entirely inside the merge engine (rejected alternatives:
  fold-only leaves a canonical gap; derive-from-session-log is cross-boundary read-path work). `entry.hlc ===
  payload.updatedAt` for puts (same `deps.hlc`); deletes carry only entry `hlc` → use entry-level hlc as the incoming
  LWW stamp. serverSeq order is per-key HLC-monotonic → no local tombstone table needed. No new dep, no `convex/`/store/UI
  change. Tests: in-memory `SyncStore`/`SyncTransport`/`clock` fakes (no `@ember/store` import). Dispatch: Sonnet TDD
  executor → fresh-context Opus reviewer (verify #1/#2/#3/#5 + no store/convex change) → branch/commit/PR "Closes #105".
  **No deploy gate** (pure core). Next: 12c (web reconciler wiring).
- **Unit 12 (Convex schema + sync server + reconciler) SCORED COMPLEX → split by boundary (2026-06-25)**,
  like 03/04/.../11. The build plan's "hard core" — first cross-device data flow. Split:
  **12a** Convex sync server (`convex/`) → **12b** core reconciler + conflict-merge fold (`packages/core`,
  invariant #5's single engine) → **12c** web reconciler wiring → **12d** mobile reconciler wiring (device-bound).
  Order: server contract → core engine → client wiring (backend/sync before frontend).
  **Architecture forks resolved with user (2026-06-25):** (1) **merge runs client-side** — Convex is a dumb
  HLC-ordered canonical record store (per-key HLC-LWW + per-owner `serverSeq` cursor); the single merge engine
  lives in core (`applyPull`, 12b) and runs on the client during pull, keeping Convex off the read path (#1) and
  the engine in one place (#5). (2) **Generic mirror schema** — one `records` table mirroring the `OutboxEntry`
  shape (03a), not domain-typed tables; specialize later when #13/#16 need it. Per-type rules (furthest-page,
  union+LWW, additive sessions) are already pinned in architecture.md and land in 12b — esp. the **furthest-page
  lossiness** under naive server LWW, flagged in 12a's spec as a 12b concern.
- **Unit 12a MERGED (2026-06-25) — PR #104 (squash), Issue #103 closed; umbrella #12 still open.** Convex sync
  server live. Built test-first (Sonnet) → reviewed fresh-context (Opus): APPROVE WITH NITS, no blocking issues;
  reviewer independently probed same-batch-dup + concurrency traps and verified ownership isolation + auth-mock
  fidelity vs real @convex-dev/auth. Delivered: schema.ts `records` + `syncState` tables (keep `...authTables`,
  indexes by_owner_key/by_owner_seq/by_owner); `convex/sync.ts` `push` (HLC-LWW upsert, per-owner monotonic
  serverSeq, acked incl. superseded) + `pull` (serverSeq cursor, asc, take(limit ?? 200)); ownership via
  getAuthUserId (throws if null). `convex-test@0.0.53` + `@edge-runtime/vm@5.0.0` + `vitest@4.1.8` harness
  (edge-runtime env). **13 tests** (insert/LWW/tombstone, acked-incl-superseded, cursor pull, limit boundary,
  same-batch dup-key, empty batch, ownership isolation, unauth throws). 3 verify cmds + CI green. **Deploy gate
  PASSED** (`npx convex dev --once` → dev necessary-warbler-246: 3 indexes added; codegen reproduced the
  `_generated/api.d.ts` sync registration with zero drift). Two hand-bridged files judged sound by review: minimal
  api.d.ts sync registration + `import-meta.d.ts` glob stub. **Next: 12b** (core reconciler + conflict-merge fold,
  `packages/core`) — where the single merge engine (#5) lands and **furthest-page lossiness** gets fixed.
  <!-- prior spec note retained below for trail -->
- **Unit 12a SPECCED (2026-06-25) — Issue #103 (umbrella #12 open), branch feat/103-convex-sync-server (not yet
  cut), spec specs/12a-convex-sync-server.md. Route standard** (one boundary `convex/`, dev-only `convex-test`
  harness, well-trodden Convex fn logic, forks resolved). Scope (`convex/` only): add `records` + `syncState`
  tables to schema.ts (keep `...authTables`); `convex/sync.ts` `push` mutation (HLC-LWW upsert keyed by
  (owner,collection,recordId), per-owner monotonic `serverSeq`, returns acked entry ids incl. superseded) +
  `pull` query (cursor by `serverSeq`, ascending, batched); ownership via `getAuthUserId(ctx)` (throw if null) —
  anon users sync their own data, cross-user claim merge is #14. No core/store/client change; invariants #1/#2/#5
  intact (no semantic merge here — that's 12b). Tests via `convex-test@0.0.53` (edge-runtime vitest env): insert/
  LWW/tombstone, cursor pull, ownership isolation, unauth throws. **USER deploy gate (deployment-bound) before
  merge:** `npx convex dev --once` pushes the schema to dev necessary-warbler-246 (same gate class as 11a).
  Dispatch: Sonnet TDD executor → fresh-context Opus reviewer → branch/commit/PR "Closes #103" → user runs the
  deploy gate before merge. Next: 12b (core reconciler + conflict-merge fold).
- **Unit 11c MERGED (2026-06-16) — PR #102, Issue #101 closed. UMBRELLA #11 COMPLETE (closed). Auth epic done:
  11a (#97) → 11b (#99/#100) → 11c (#101/#102), all merged + device-verified.**
  **Device-gate fixes (3 rounds, real Android):** (1) account modal auto-opened on launch + Close threw `GO_BACK
  was not handled` — the root Stack only declared the `account` screen, making it the initial route; fixed with
  `unstable_settings = { initialRouteName: '(tabs)' }` so the app anchors on the tabs and /account opens only via
  the header icon. (2) white bg in dark mode + washed-out text — `bg-surface` on a `SafeAreaView` via className
  doesn't paint, so the native modal's light default showed through under dark-theme (light) text; fixed by moving
  `bg-surface` onto a plain `<View>` wrapper, SafeAreaView for insets only (library-screen pattern). (3) Close
  hardened with a `router.canGoBack()` fallback. `app.json` gained the `expo-secure-store` config plugin.
  **CI fix (pre-existing since 11a):** CI was red because `convex/_generated/` was git-ignored with no CI codegen
  (`convex codegen` needs deployment access for the @convex-dev/auth component API and pushes on run). Per Convex's
  own guidance (`codegen --help`: "should be committed to the repo") → un-ignored + committed `convex/_generated/`;
  CI now green (typecheck/lint/test) with no secret/deploy step.
  --- (build history below) ---
  Dispatched: Sonnet TDD executor (25 pure-helper tests across should-sign-in-anonymously/derive-account-view/
  auth-errors/gate-reducer; all impl + provider wiring) → fresh-context Opus reviewer = CHANGES-REQUIRED (one
  blocker) → fixed. **Blocker:** AccountButton mounted unconditionally → its `useConvexAuth`/`useQuery` hooks
  throw when `convex===null` (no provider above), crashing the Library screen in the missing-env/offline-local
  path the unit exists to protect (invariant #1). Web never hit this (web throws on missing URL). **Fix:** gate
  `{convex !== null && <AccountButton/>}` in the header + `<Redirect href="/library"/>` defensive guard in the
  `/account` route. Re-verified green (workspace typecheck/lint/test exit 0). Also: `app.json` adds the
  `expo-secure-store` config plugin. Awaiting USER device gate before merge.
  Wires the Expo client to the 11a backend, mirroring 11b re-expressed for RN. **Product fork resolved with user
  (2026-06-16):** account-UI placement = **dedicated account sheet** — a person icon in the Library header (beside
  ThemeControl) opens an expo-router modal holding claim / sign-in / sign-out (NOT inline Today, NOT a nav tab).
  Scope (`apps/mobile/` only — the `convex/package.json` `_generated/api` export shim already exists from 11b):
  add `convex@1.40.0` + `@convex-dev/auth@0.0.94` + `expo-secure-store` + `expo-network` + `@ember/convex`
  (workspace; single convex copy — same pin as `convex/`/`apps/web`); `ConvexAuthProvider` with a **SecureStore**
  token-storage adapter + key-safe `storageNamespace`, above ThemeProvider, inside an `AuthProviderGate`;
  `useAnonymousAuth` (auto anon sign-in gated on `expo-network`, retries on network-restored, re-anons after
  sign-out); `use-account` (loading/anonymous/claimed from `useConvexAuth` + `useQuery(api.users.currentUser)`);
  account icon + modal sheet; ported `auth-errors` (`friendlyAuthError`, intentional web↔mobile dup); `.env.example`.
  **Claim reactivity (carry-forward from 11b):** anon→password claim swaps one non-null token for another so
  `isAuthenticated` never flips and `client.setAuth` is never re-called — RN has no `window.location.reload()`, so
  the fix is **remount the provider subtree via a `key` bump** (`AuthProviderGate.resetAuthClient()`), which
  re-reads the SecureStore token; module state survives a React remount so the success toast shows directly (no
  sessionStorage shuttle). Fallback: recreate the `ConvexReactClient`. **No core/store/outbox/clock change, no
  `owner` field, no mutation signature change** (invariants #1/#2); missing `EXPO_PUBLIC_CONVEX_URL` is non-fatal
  → app runs offline-local (improves on 11b's hard throw; invariant #1). Mobile has no component-render test infra
  → test **pure helpers** (`deriveAccountView`, `shouldSignInAnonymously`, `auth-errors`, the gate reducer); UI
  verified in the device gate (mobile convention). UI unit → frontend-design + impeccable before review.
  **USER device-verify gate (deployment-bound) before merge:** `apps/mobile/.env.local` with the dev URL
  (necessary-warbler-246) → `pnpm --filter @ember/mobile start` on device/sim → anonymous load → claim →
  query re-bind w/o reload → kill+reopen persists (SecureStore) → sign out → sign in → airplane-mode still usable.
  Dispatch: Sonnet TDD executor → frontend-design + impeccable → fresh-context Opus reviewer → branch/commit/PR
  "Closes #101" → user runs the env + device gate before merge. **On merge: close umbrella #11.**
- **Unit 11 (Auth: anonymous-local → account claim) SCORED COMPLEX → split by boundary (2026-06-15)**, like
  03/04/.../10. First sync-umbrella unit; lands deliberately BEFORE #12 ("security before the features it gates").
  **Product/architecture forks resolved with user (2026-06-15):** (1) provider = **Convex Auth**
  (`@convex-dev/auth`, first-party — Anonymous provider + upgrade-to-permanent maps onto anon→claim, identity
  stays in our `convex/schema.ts`); (2) claim credential = **Password** (email+password; OTP/OAuth deferred);
  (3) scope = **identity layer only** — anon sign-in + password claim + auth UI both clients; the cross-device
  DATA push/merge stays in #12 and claim-as-data-merge UI in #14. **Key architecture call:** ownership is
  enforced **server-side at push time** via the authed Convex user (`ctx.auth`), NOT a local `owner` field →
  this umbrella touches **no** core/store/outbox source and adds no mutation arg (invariants #1/#2 untouched).
  Convex Anonymous needs network, so offline-first is unaffected: no Convex session on a first-offline launch,
  app fully usable, outbox accumulates; client signs in anon when online; claim upgrades the *same* user to
  Password. Split: **11a** Convex Auth backend (this — specced) → **11b** web auth UI + provider →
  **11c** mobile auth UI + provider (device-bound).
- **Unit 11b MERGED (2026-06-16) — PR #100 (squash d4fdbcc), Issue #99 closed; USER browser-verify gate passed
  (anonymous load → claim → sign out → sign in all green against dev necessary-warbler-246).** Two post-review
  fixes landed on-branch during the gate: (a) **error sanitization** — `friendlyAuthError(err, mode)` maps Convex
  Auth's stable result tokens (`InvalidSecret`/`InvalidAccountId` = wrong-password/no-account → "Incorrect email or
  password."; account-exists; rate-limit; weak-password; network) to one calm sentence per flow and never leaks the
  raw `[CONVEX A(auth:signIn)] … Uncaught Error` string (the user hit this); (b) **claim reactivity** — anon→password
  claim swaps one non-null token for another, so `@convex-dev/auth` never flips `isAuthenticated` and convex/react's
  `ConvexProviderWithAuth` never re-calls `client.setAuth`, leaving every live query on the stale anonymous identity
  until reload. Re-invoking `setAuth` ourselves would clobber the provider's backend auth-state callback, so a
  successful claim/sign-in finishes with a deliberate `window.location.reload()` (`claim-reload.ts`) that re-reads the
  stored password token; the success toast is carried across via sessionStorage. Sign-out flips token→null (real
  status change) so it stays reactive — no reload. Dispatched standard route: Sonnet TDD executor → frontend-design +
  impeccable (account menu/dialog visual+a11y polish; token-driven) → fresh-context Opus review = **APPROVE WITH
  NITS**. Reviewer's one behavioral nit — `useAnonymousAuth` did not re-anon after sign-out within a session
  (`hasFiredRef` latched) — was **fixed in-branch** (guard clears once `isAuthenticated` flips true) and locked
  with regression test (8). Built (all in `apps/web/` + one `convex/package.json` export line + lockfile):
  `ConvexAuthProvider` over `ConvexReactClient(VITE_CONVEX_URL)` outside Theme/Store providers; `useAnonymousAuth`;
  `use-account`; `account-menu.tsx` + `auth-dialog.tsx`; vendored shadcn dialog/input/label; `.env.example`. Web
  imports the generated `api` via the `@ember/convex/_generated/api` export shim + a matching tsconfig path alias
  (workspace export resolved — no relative fallback needed). Verify green at merge: `pnpm -w typecheck` 9/9,
  `pnpm -w test` (web 288 — incl. re-anon, error-sanitizer, and claim-reload tests), `pnpm -w lint` 6/6. Single
  `convex@1.40.0` in lockfile (no 1.41). Invariants #1/#2
  intact (no core/store/outbox/clock change, no `owner` field, no mutation signature change; auth never gates
  content). Token gap surfaced (pre-existing, NOT introduced here): `text-destructive` resolves to hardcoded hex
  via the shadcn alias layer — no `--color-error` semantic token in `packages/tokens` yet. **USER gate before
  merge:** create `apps/web/.env.local` with `VITE_CONVEX_URL` = root `.env.local` `CONVEX_URL` (necessary-warbler-246)
  → `pnpm --filter @ember/web dev` → anonymous load → create account → reload-persists → sign out → re-anon (no
  reload) → sign in → offline-still-usable. Next: 11c (mobile auth UI + provider, device-bound).
- **Unit 11b SPECCED (2026-06-15) — Issue #99 (umbrella #11 open), branch feat/99-web-auth-ui (not yet cut),
  spec specs/11b-web-auth-ui.md. Route standard, UI unit.** Second slice; wires the web client to the 11a
  backend. **Product forks resolved with user (2026-06-15):** (1) auth UI = **header account menu + shadcn
  Dialog** (beside ThemeControl; anonymous → "Save your library", claimed → email + Sign out) — NOT a dedicated
  route; (2) flows = **claim (signUp upgrade) + returning sign-in (signIn) + sign out** (cross-device data pull =
  #12, claim-as-merge UI = #14, both out of scope). Scope (`apps/web/` + one `convex/package.json` export line):
  add `convex@1.40.0` + `@convex-dev/auth@0.0.94` to apps/web (single convex copy — same pin as `convex/`);
  `ConvexAuthProvider` over a `ConvexReactClient(import.meta.env.VITE_CONVEX_URL)` in main.tsx (auth never gates
  content — invariant #1); `useAnonymousAuth` (auto anon sign-in when online+unauthed, retries on `online`);
  `use-account` (derives loading/anonymous/claimed from `useConvexAuth` + `useQuery(api.users.currentUser)`);
  `account-menu.tsx` + `auth-dialog.tsx` (vendor shadcn dialog/input/label); `apps/web/.env.example`. Web imports
  the generated `api` via a `@ember/convex/_generated/api` export shim (`_generated` is git-ignored → codegen gate,
  like 11a's deploy gate). **No core/store/outbox/clock change, no `owner` field, no mutation signature change**
  (invariants #1/#2 intact). Tests mock `@convex-dev/auth/react` + `convex/react` (no real client in jsdom). UI
  unit → frontend-design + impeccable before review. **USER browser-verify gate (deployment-bound) before merge:**
  create `apps/web/.env.local` with the dev URL (root `.env.local` `CONVEX_URL`, deployment necessary-warbler-246)
  → `pnpm --filter @ember/web dev` → anonymous load → create account → reload-persists → sign out → sign in →
  offline-still-usable. Dispatch: Sonnet TDD executor → frontend-design + impeccable → fresh-context Opus reviewer
  → branch/commit/PR "Closes #99" → user runs the env + browser-verify gate before merge. Next: 11c (mobile, device-bound).
- **Unit 11a MERGED (2026-06-15) — PR #98 (squash fbb7891), Issue #97 closed; schema deployed to dev
  necessary-warbler-246.** Issue #97 (umbrella #11 open), branch feat/97-convex-auth-backend, spec specs/11a-convex-auth-backend.md.
  Dispatched standard route: Sonnet executor → fresh-context Opus review = **APPROVE** (no blockers).
  Built (all in `convex/`): `auth.ts` (Anonymous + Password — note: `Anonymous` is a *named* import in
  @convex-dev/auth@0.0.94, not default as the spec drafted), `http.ts`, `schema.ts` (`...authTables`),
  `users.ts` (`currentUser`; `isAnonymous` prefers the lib's own flag, falls back to no-email heuristic),
  hand-authored `auth.config.ts` (byte-identical to CLI template, no secret material), `@convex-dev/auth@0.0.94`
  + `@auth/core@0.41.2` installed, convex still pinned 1.40.0, `tsconfig.json` gained `"types":["node"]` for
  `process.env`. `pnpm -w typecheck/lint/test` all green (258 tests). Nothing outside `convex/` changed except
  pnpm-lock + context docs (invariants #1/#2 intact). USER setup gate completed: `npx @convex-dev/auth` minted
  JWT_PRIVATE_KEY/JWKS/SITE_URL + `npx convex dev --once` pushed the auth schema cleanly (`users`/`currentUser`
  live). PR #98 squash-merged (fbb7891). **Next: 11b (web auth UI + provider) — specced, see above.**
- ~~**Unit 11a SPECCED (2026-06-15) — Issue #97 (umbrella #11 open), branch feat/97-convex-auth-backend
  (not yet cut), spec specs/11a-convex-auth-backend.md. Route standard** (single boundary `convex/`, new dep,
  well-trodden config + one query, ambiguity resolved). First real Convex code in the repo. Scope (`convex/`
  only): install `@convex-dev/auth@0.0.94` + `@auth/core@0.41.2` (convex stays repo-pinned 1.40.0); `auth.ts`
  (`convexAuth` w/ Anonymous + Password providers); `http.ts` (`auth.addHttpRoutes`); `schema.ts` spreads
  `...authTables`; `auth.config.ts` (generated by setup, committed); `users.ts` `currentUser` query (returns
  `null` or `{ _id, email, isAnonymous }` so a client can tell anon vs claimed). No client UI, no tests required
  (config + one query; convex-test harness deferred). **USER setup gate (account-bound, like EAS/CF secrets):**
  run `npx @convex-dev/auth` (mints JWT_PRIVATE_KEY/JWKS/SITE_URL env on the dev deployment) + `convex dev` to
  deploy the auth schema — no headless substitute for minting deployment JWT keys. Dispatch: Sonnet executor →
  fresh-context Opus reviewer (verify #1/#2 non-violation: no owner field, store untouched; Convex-eslint clean;
  Anonymous+Password+authTables+http wiring matches the lib contract) → branch/commit/PR "Closes #97" → user runs
  the setup/deploy gate before merge. Next: 11b (web auth UI + provider).~~ *(superseded — see BUILT entry above)*
- **✅ Umbrella Unit 10 (Highlights + notes) COMPLETE (2026-06-14)** — all five slices merged, Issue #10 closed.
  See the dated entry below.
- **Unit 10 (Highlights + notes) SCORED COMPLEX → split by boundary (2026-06-13), like 03/04/05/06/07/08/09.**
  Crosses 4 boundaries: core (annotation model + anchor→rect resolver over 05c's `PageTextGeometry`), store
  (new syncable type, outbox/HLC LWW), apps/web reader UI, apps/mobile reader UI. **Product forks resolved
  with user (2026-06-13):** (1) **4-color palette** yellow/green/blue/pink (new `--color-highlight-*` tokens
  land in 10b where first rendered, not 10a); (2) **two annotation kinds** — colored `highlight` (optional
  note) + standalone anchored `note` (required text, no fill); (3) **text-anchored only this umbrella** —
  pixel-rect fallback for scanned PDFs **deferred to its own later unit**. Split: **10a** shared brain
  (core model + pure `resolveAnchorRects`/`buildPageText` + store `saveAnnotation`/`listAnnotations`/
  `deleteAnnotation`) → web reader UI → mobile reader UI. **Web slice re-split (2026-06-13) once examined:**
  **10b** web create+render (tokens + selection→anchor + render + create) / **10c** web edit-recolor-delete +
  standalone notes / **10d** mobile reader highlight+notes UI (WebView selection bridge, device-bound).
- **Unit 10a SPECCED (2026-06-13) — Issue #86 (umbrella #10 open), branch feat/86-annotation-model-anchor-resolver
  (not yet cut), spec specs/10a-annotation-model-anchor-resolver.md. Route standard** (single shared brain
  packages/core+packages/store, no new dep, no UI, ambiguity resolved — mirrors 04a/07a/08a/09d). Core: new
  `annotation.ts` (`Annotation` UUID-keyed mutable record, `kind` highlight|note, `TextAnchor`
  {page,startChar,endChar,quote}, `makeAnnotation`/`editAnnotation` pure+validated, caller supplies id/time/
  hlc) + new `anchor-resolver.ts` (`buildPageText` = canonical separator-free page-text concat; pure
  `resolveAnchorRects` char-range→one NormalizedBox per overlapped 05c item, uniform-advance partial slice).
  Store: new `annotations.ts` (`saveAnnotation` upsert+1 put outbox; `deleteAnnotation` delete+1 tombstone
  outbox; `listAnnotations(docId?)`). Annotations are mutable+deletable (unlike append-only sessions) → LWW
  via `updatedAt` HLC, but the real merge is unit-12's reconciler (invariant #5 — 10a invents no merge logic).
  Fully headless-testable (no DOM/pdf.js/clock in core).
- **Unit 10a BUILT + REVIEWED + MERGE-READY (2026-06-13) — Issue #86, branch feat/86-annotation-model-anchor-resolver,
  PR opened.** Sonnet TDD executor built test-first (core `annotation.ts`+`anchor-resolver.ts`, store
  `annotations.ts`, barrels) → 50 new tests; fresh-context Opus reviewer verdict **APPROVE** (spec-conformant,
  invariants #1/#2/#3/#5 hold, resolver math + char-accounting verified, outbox one-entry-per-mutation, pure).
  One optional nit (empty-string-clears-highlight-note untested) closed with an added assertion. Verify clean:
  `pnpm -w typecheck` / `test` (core 224, store 108, web 188, mobile 156, tokens 23) / `lint` all green.
  Unit 10a **MERGED** (PR #87, squash) — branch deleted, Issue #86 closed, main at 9b00a38.
- **Unit 10b SPECCED (2026-06-13) — Issue #88 (umbrella #10 open), branch feat/88-web-highlight-create-render
  (not yet cut), spec specs/10b-web-highlight-create-render.md. Route standard** (one web boundary + tokens leaf;
  the DOM-selection→char-offset unknown isolated in a pure jsdom-tested helper — mirrors 09e). **Product forks
  resolved with user:** selection affordance = **floating 4-swatch toolbar** (Note button + standalone notes →
  10c); **edit/recolor/delete deferred to 10c**; text-anchored only; single-page anchors. Scope: (1) `packages/
  tokens` — `highlights` registry + `--color-highlight-{yellow,green,blue,pink}` in theme.css + theme.uniwind.css
  + parity test; (2) `selection-anchor.ts` (pure) DOM Range→`(page,startChar,endChar,quote)` via `buildPageText`,
  `quote` canonical, collapsed/reversed/cross-page handled; (3) `highlight-layer.tsx` paints saved highlights via
  `resolveAnchorRects` (one rect/overlapped item, between canvas + text layer); (4) `selection-toolbar.tsx` +
  `use-annotations.ts` + `web-store.createAnnotation`/`listAnnotations` (one mutation = one HLC `put`, invariant
  #2). UI unit → frontend-design + impeccable before review. First verifiable result: select text → tap color →
  highlight paints → reload → still there.
- **Unit 10b MERGED (2026-06-13) — PR #89 (squash), Issue #88 closed, branch deleted, main at 242ebbc.**
  Built TDD (Sonnet executor): tokens (`highlights` registry + `--color-highlight-*` in both CSS files + parity
  test), pure `selection-anchor.ts` (DOM Range→`buildPageText` offsets, canonical `quote`), `highlight-layer.tsx`
  (rects between canvas + text layer), floating 4-swatch `selection-toolbar.tsx`, `use-annotations.ts`,
  `web-store.createAnnotation`/`listAnnotations` (one HLC `put`). Fresh-context Opus review **REQUEST CHANGES** →
  one should-fix: highlights invisible on the **night** theme (hardcoded `mix-blend-multiply` crushes the tint to
  black). **Fixed** with a theme-driven `--highlight-blend` token (multiply on paper/sepia, screen on night) — only
  the blend flips, palette stays single-sourced (invariant #6); nits addressed.
  **Post-review bug (user-reported): reader flickered nonstop on any text PDF.** Cause: 10b put the inline
  `onTextGeometry` closure in `PdfPage`'s canvas-render-effect deps → reporting geometry (`setPageGeometries`)
  re-rendered the parent → new callback identity → effect re-ran → repainted canvas + re-fired geometry → infinite
  loop. (Untestable in jsdom — no canvas `getContext`, so the geometry path never runs in tests.) **Fixed** by
  holding the callback in a ref and dropping it from the deps (canvas render now depends only on
  pdf/page/width/active). `pnpm -w typecheck` ✓ · `test` ✓ (web 225 / +36, tokens 28 / +5, core 224, store 108,
  mobile 156) · `lint` ✓. Invariants #1/#2/#6 + core purity verified. **Phase: umbrella Unit 10 second slice
  (web create+render) COMPLETE.** **Next:** spec 10c (web edit/recolor/delete + standalone notes + pins), then 10d
  (mobile, WebView selection bridge). Awaiting user "spec 10c".
- **Unit 10c SPECCED (2026-06-13) — Issue #90 (umbrella #10 open), branch feat/90-web-annotation-edit-notes
  (not yet cut), spec specs/10c-web-annotation-edit-notes.md. Route standard** (one boundary apps/web — the
  shared brain is done: 10a `editAnnotation` + store `saveAnnotation`/`deleteAnnotation`, `note` kind exists;
  no new dep — `radix-ui`+`lucide-react` already installed). **Product/UX forks resolved with user:**
  (1) **edit = click highlight → popover** (4 recolor swatches + note textarea + delete); (2) **standalone
  `note` kind = margin pin glyph + dotted underline** on the anchored text, click-to-edit; (3) **Note button**
  added to the 10b selection toolbar (creates a `note`); (4) edit/recolor/delete + notes kept in **one** unit.
  Scope: web-store facade `updateAnnotation`/`deleteAnnotation` (one HLC-stamped outbox entry each, #2) →
  `use-annotations` gains `createNote`/`updateAnnotation`/`removeAnnotation` → vendored shadcn `popover.tsx` →
  `highlight-layer` made interactive (rects = focusable click targets; note pins+underline) →
  `annotation-popover.tsx` editor → toolbar Note button → reader-page wiring (`selected` annotation+rect state).
  No core/store source change beyond the web facade. UI unit → frontend-design + impeccable before review.
  First verifiable result: click a highlight → recolor/note/delete; select → Note → pinned margin note; all
  survive reload.
- **Unit 10c MERGED (2026-06-14) — PR #91 (squash, Closes #90), branch deleted.**
  Dispatched standard route: Sonnet TDD executor (test-first) → frontend-design + impeccable (UI) →
  fresh-context Opus reviewer. Shipped: web-store `updateAnnotation`/`deleteAnnotation` (one HLC-stamped
  outbox entry each, #2; store delete import aliased) · `use-annotations` `createNote`/`updateAnnotation`/
  `removeAnnotation` (optimistic) · interactive `highlight-layer` (rects = focusable `<button>`s; note kind =
  dotted underline + ember margin pin, not a fill; note-dot on note-carrying highlights) · new
  `annotation-popover.tsx` (swatches + note textarea + calm delete; hand-rolled fixed-position panel anchored
  to clicked rect, Esc/click-outside close, autofocus) · toolbar **Note** button (`onCreateNote`) · reader-page
  wiring threads `onSelectAnnotation` through both scroll+paged modes; transient unsaved-draft Note flow so
  empty `note`-kind records are never written (10a). `pnpm -w typecheck` ✓ · `test` ✓ (web 257 / +1 Esc) ·
  `lint` ✓. Invariants #1\#2\#6 + core purity verified; no core/store source change beyond the web facade.
  **Reviewer verdict: APPROVE WITH NITS** — fixed pre-merge: deleted the unused vendored `popover.tsx`
  (hand-rolled panel is the chosen approach — Radix's anchor model fits an arbitrary clicked rect poorly +
  jsdom flake), added the missing Esc-closes test, added textarea autofocus. Highlights + notes now fully
  editable on web (create/render 10b + edit/recolor/delete/notes 10c).
- **Mobile slice (10d-as-one-unit) SCORED COMPLEX → split (2026-06-14), mirroring the web split.** "10d" in the
  plan was the *entire* mobile annotation experience — which bundles what web needed TWO units for (10b
  create+render, 10c edit+notes) PLUS net-new WebView-bridge infra web never needed (selection capture across the
  bridge, paint-sync into the pdf.js HTML, tap-to-select). One signal = 2 (novel logic) → complex → split, same
  shape as the web side: **10d** mobile create+render (mirror 10b) → **10e** mobile edit/recolor/delete + notes/pins
  (mirror 10c). Both apps/mobile-only, device-bound.
- **Unit 10d SPECCED (2026-06-14) — Issue #92 (umbrella #10 open), branch feat/92-mobile-highlight-create-render
  (not yet cut), spec specs/10d-mobile-highlight-create-render.md. Route standard, UI unit, DEVICE-BOUND.** First
  mobile slice. **Platform shift:** the mobile reader is pdf.js in a WebView, so 10d splits along the bridge — the
  *WebView (HTML string)* does selection capture + char-offset DOM-walk + dumb paint (no tokens, no `@ember/core`,
  like the existing `READER_PALETTE` exception); *RN* does everything needing core/tokens (derive `quote`+TextAnchor
  from posted offsets, `resolveAnchorRects`→normalized boxes posted back for paint, native uniwind swatch toolbar,
  store mutation). Bridge adds WebView→RN `selection`/`selectionCleared`, RN→WebView `setAnnotations`/`clearSelection`.
  Scope (apps/mobile ONLY): native-store `createAnnotation`/`listAnnotations` (verbatim web-store shape, one HLC
  outbox entry per create, #2) · pure `annotation-anchor.ts` (`anchorFromSelection`/`boxesForAnnotation`) ·
  `use-annotations.ts` (load+create, `{store}` gate) · pure `highlight-paint.ts` (`buildSetAnnotationsMessage`) ·
  `build-reader-html.ts` selection bridge + in-HTML paint layer (palette hardcoded to `--color-highlight-*`, parity
  comment; per-theme multiply/screen blend) · `reader-webview.tsx` bridge wiring · `reader-screen.tsx` geometry
  collection + selection state + toolbar overlay · new native `selection-toolbar.tsx` (uniwind swatches). No
  core/store/tokens package change (10a brain + 10b tokens reused). UI unit → frontend-design + impeccable before
  review. Pure helpers vitest-tested; hook/bridge/toolbar/paint device-verified (no headless RN renderer — 05a/07c/
  08c/09c precedent). First verifiable result: select text → tap color → highlight paints → reopen doc → still there.
  Dispatch route: Sonnet TDD executor → frontend-design + impeccable → fresh-context Opus reviewer → branch/commit/PR
  "Closes #92" → Device-verify (Expo Go) before merge.
- **Unit 10d DISPATCHED → PR #93 OPEN, awaiting device-verify (2026-06-14).** Branch feat/92-mobile-highlight-create-render
  (8ed20ac). Sonnet TDD executor built all 13 files; 39 new vitest tests (native-store-annotation 7, annotation-anchor 10,
  highlight-paint 7, build-reader-html 15). Fresh-context Opus review → **REQUEST CHANGES**, all fixed: (1) BLOCKING —
  paged mode never stamped `data-page` on its page container → selection capture + setAnnotations repaint both broke in
  paged mode; now stamped to match scroll mode; (2) should-fix — selection toolbar `left` had no upper clamp → could
  overflow the right edge; now measures overlay width via `onLayout` and clamps both sides (TOOLBAR_WIDTH=196); (3) nit —
  `[...HIGHLIGHT_COLORS]` instead of a double-cast. Re-verified all green: `pnpm -w typecheck` 9 ✓ · `pnpm -w test` (mobile
  195) ✓ · `pnpm -w lint` ✓. Invariants confirmed: #1 (local repo only), #2 (one HLC stamp shared by record+outbox),
  #6 (RN tokens; in-HTML HIGHLIGHT_HEX is the parity-commented WebView exception, values == `--color-highlight-*`).
  apps/mobile-only diff.
- **Unit 10d MERGED (2026-06-14) — PR #93 (squash ac5d83d), Issue #92 closed.** Device-verify passed (Expo Go): all 4
  colors paint and persist after a full app reload. **Device-verify surfaced one extra fix:** Android/iOS show a *native*
  text-selection action menu (Copy / Share / Select all) as a **system overlay above all app content**, which covered our
  SelectionToolbar (positioned just above the same selection). Fixed by `menuItems={[]}` on `<WebView>` — suppresses the
  native menu on both platforms while leaving selection (handles + `selectionchange`) intact. **Carry-forward for 10e**
  (its edit/recolor toolbar overlays a *tapped highlight*, same overlay-vs-system-menu class of issue): any custom UI
  drawn over a WebView text selection must suppress the native menu via `menuItems={[]}`. Mobile create+render done;
  **Next:** spec 10e (mobile edit/recolor/delete + standalone notes/pins — the final slice of umbrella Unit 10).
  Awaiting user "spec 10e".
- **Unit 10e SPECCED (2026-06-14) — Issue #94 (umbrella #10 open), branch feat/94-mobile-annotation-edit-notes
  (not yet cut), spec specs/10e-mobile-annotation-edit-notes.md. Route standard, UI unit, DEVICE-BOUND.** Final
  slice of umbrella Unit 10; mirrors web 10c onto the WebView bridge, building on 10d. **Platform shift:** adds
  ONE new bridge message — WebView→RN `{type:'annotationTap', id, rect}` (tappable `.ember-hl` overlays + note
  pins stamp `dataset.annId`/`pointer-events:auto` and post on tap); RN owns the native editor, store mutations,
  and repaint via the **existing** `setAnnotations` post (no new RN→WebView message for edit/delete). **Product
  forks (carried from 10c):** edit = tap highlight → native editor card (4 recolor swatches + note textarea +
  calm delete); standalone `note` kind = margin ember pin + dotted underline, tap-to-edit; Note button on the
  10d selection toolbar (transient unsaved-draft flow — empty notes never written, 10a). Scope (apps/mobile
  ONLY): native-store `updateAnnotation`/`deleteAnnotation` (one HLC outbox entry each, #2; store delete aliased)
  · `use-annotations` `createNote`/`updateAnnotation`/`removeAnnotation` (optimistic) · `build-reader-html.ts`
  tap reporter + note-kind paint branch (dotted underline + pin; accent hex = parity-commented WebView exception)
  · `reader-webview.tsx` `annotationTap` wiring · new native `annotation-editor.tsx` · `selection-toolbar.tsx`
  Note button · `reader-screen.tsx` editing-state + draft-note wiring. No core/store/tokens package change.
  Tests: native-store-annotation + build-reader-html extended (vitest); editor/hook/bridge/note-paint
  device-verified (no headless RN renderer — 10d precedent). Dispatch route: Sonnet TDD executor →
  frontend-design + impeccable → fresh-context Opus reviewer → branch/commit/PR "Closes #94" → Device-verify
  (Expo Go) before merge.
- **Unit 10e MERGED (2026-06-14) — PR #95 (squash 50dcd73), Issue #94 closed.** Built exactly to spec:
  native-store `updateAnnotation`/`deleteAnnotation` (one shared HLC stamp = one outbox entry each, #2 — asserted
  in tests: `outbox[1].hlc === updated.updatedAt`, single delete tombstone) · `use-annotations` createNote/
  updateAnnotation/removeAnnotation · build-reader-html tap reporter + note-kind paint (pin + dotted underline,
  `NOTE_ACCENT_HEX` parity-commented) · new `annotation-editor.tsx` (uniwind card) · selection-toolbar Note button
  · reader-screen editing-state + transient draft flow. Fresh-context review APPROVE-WITH-NITS (onBlur redundant-
  save nit fixed). **Device-verify shipped two UI fixes:** the editor is now a keyboard-aware **bottom sheet over a
  dim scrim** (rect-anchored card jammed the screen edge / covered the annotated text); and since
  KeyboardAvoidingView is a no-op for an absolute overlay on Android, the sheet is lifted by the **live keyboard
  height** (`Keyboard` show/hide listeners → `bottom: keyboardHeight`) so the note field + Save/Remove stay above
  the keyboard. User-verified on device (Expo Go). apps/mobile-only.
- **🎉 Umbrella Unit 10 (Highlights + notes, both platforms) COMPLETE (2026-06-14)** — all five slices MERGED;
  umbrella Issue #10 closed: 10a shared brain (#86) → 10b web create+render (#88) → 10c web edit/notes (#90) →
  10d mobile create+render (#92) → 10e mobile edit/recolor/delete + standalone notes/pins (#94, PR #95). Annotations are now first-class on both web and
  mobile: create / recolor / note / delete + standalone margin notes, all offline-first, each mutation one
  HLC-stamped outbox entry (#2), anchor/rect math single-sourced in core, WebView stays a dumb painter (#6
  in-HTML hex exception parity-commented). Sync reconciliation across devices is unit-12.
- **🎉 Umbrella Unit 09 (Stats tab, both platforms) COMPLETE (2026-06-13)** — all six slices MERGED:
  Phase 1 page-count capture 09a (#74) / 09b (#77) / 09c (#79); Phase 2 analytics 09d engine (#81) →
  09e web Stats UI (#83) → 09f mobile Stats UI (#85). Stats now ship on web and mobile, fully derived
  from on-device sessions (invariant #3). The reading-habit layer (streak + goal ring + Stats) is in
  place across both apps. Umbrella issue #9 closed.
- **Unit 09f DONE + MERGED (2026-06-13) — PR #85 squashed to main (8bde947), Issue #84 closed.** Mobile
  Stats tab: third bottom tab (`app/(tabs)/stats.tsx` + `<Tabs.Screen name="stats">` + bespoke token-
  colored `StatsIcon` in `_layout.tsx`) → pure `present-stats.ts` (**verbatim port of web 09e's**, 51 tests
  — byte-identical, confirmed by reviewer `diff`) → `use-stats.ts` (`{store,ready}` gate + cancel flag,
  swallow read errors → neutral `defaultView()`, invariant #1) → six section components (uniwind +
  `react-native-svg`) → `stats-screen.tsx` (`SafeAreaView`+`ScrollView` shell). RN adaptations: token
  colors via `useResolveClassNames`→`ColorValue`; heatmap ramp = accent `ColorValue` + per-level opacity
  (no `color-mix`) in a horizontal `ScrollView`; loading skeleton + warm empty state. apps/mobile-only, no
  core/store/dep change. **Executor (Sonnet) hit a session limit mid-build (had the presenter+51 tests,
  hook, 4/7 sections); finished inline** (book-progress list/row, screen, route, tab wiring) mirroring the
  audited web 09e + mobile Today idioms; fixed RN `DimensionValue` percentage-width typing + import order.
  Fresh-context Opus reviewer = **APPROVED**, no blockers (invariants #1/#3/#6 verified, verbatim port
  confirmed). Non-blocking note (first literal `text-streak-*` use) closed defensively by adding those
  tokens to the `@source inline(...)` safelist in `global.css`. typecheck ✓ · mobile test 156 (incl. 51
  present-stats) ✓ · lint ✓. Screen/hook/components device-verified in **Expo Go** (no headless RN
  renderer — 08c/09c precedent). **Phase 2 final slice (mobile UI) COMPLETE — umbrella Unit 09 done.**
- **Unit 09e DONE + MERGED (2026-06-13) — PR #83 squashed to main (f60f457), Issue #82 closed.** Web Stats
  tab: `/stats` route + nav Tab, pure `present-stats.ts` (51 tests) → `use-stats.ts` (swallow→neutral view)
  → six section components → `stats-page.tsx`; apps/web-only, no core/store/dep change. Sonnet TDD executor
  (frontend-design built UI, impeccable audited a11y/visual/motion) → fresh-context Opus reviewer = APPROVED,
  no blockers (re-ran typecheck/test 188/lint, audited purity + invariants #1/#3/#6 + spec fidelity).
  typecheck ✓ · web test 188 ✓ · lint ✓. **Phase 2 second slice (web UI) COMPLETE.** Next: 09f mobile Stats.
- **Unit 09d DONE + MERGED (2026-06-13) — PR #81 squashed to main (22719e6), Issue #80 closed.** Sonnet TDD executor → fresh-context Opus reviewer
  (re-ran all 3 suites himself, analytics tests verified **uncached** 49/49) = **APPROVE, no changes.**
  **Phase 2 (analytics), first slice.** Diff (packages/core only): new pure `analytics.ts` of `derive*`
  functions over `ReadingSession[]` (+ `Document.pageCount` from Phase 1, + `ReadingPosition` furthest page),
  reusing `activeMsByDay`/`nextLocalDay`, no `Date.now()`; barrel line; new exhaustive `analytics.test.ts`.
  Surface (the contract 09e/09f import): `hourOf`, `deriveTotals` (activeMs/pagesTurned/daysRead/sessions),
  `deriveSpeed` (pagesPerHour/msPerPage, `null` on no data), `deriveTimeOfDay`+`dayPartOfHour` (4 day-parts —
  morning 05–11/afternoon 12–16/evening 17–21/night 22–04, by local start hour), `buildHeatmap(sessions,
  fromDay, toDay)` (dense zero-filled inclusive series; `fromDay>toDay`→[]), `deriveBookProgress` (per-doc
  furthestPage from ReadingPosition→max session page→0; progressRatio clamped/pagesRemaining/etaMs `null`
  when pageCount unknown; ETA speed per-book→global→null), `deriveAnalytics` composition (heatmap kept
  separate — needs a window). **Product decisions (resolved with user 2026-06-13):** one engine unit;
  4 day-parts; ETA per-book-fall-back-to-global; progress basis = furthest reading-position page / pageCount
  (invariant #5). No store change — list seams already existed. Verify green: typecheck 9 ✓ · test 170 core
  (49 new) ✓ · lint 6 ✓. Invariants #1 (pure on-device, no Convex/I/O) + #3 (stats DERIVED, never stored)
  intact. **Phase 2 first slice (core engine) COMPLETE.** Next: Phase 2 → 09e web Stats tab UI (specced;
  needs frontend-design + impeccable).
- **Unit 09c DONE + MERGED (2026-06-13) — PR #79 squashed to main (2f6283a), Issue #78 closed.** Sonnet TDD
  executor → fresh-context Opus reviewer (re-ran all 3 suites himself) = **APPROVE, no changes**. Diff
  (apps/mobile only): NativeStore `setDocumentPageCount` facade + new `useCapturePageCount` fire-once hook
  (`?.` null-store guard) + reader-screen wiring; WebView bridge untouched (already surfaced `numPages`).
  Test: native-store-page-count (3, surface only — no renderHook, mobile has no headless renderer, hook
  Expo-Go-verified per session-tracking precedent). Verify green: typecheck 9 ✓ · test 105 mobile ✓ · lint 6 ✓.
  **Phase 1 (page-count capture) COMPLETE** — 09a (core/store #74) + 09b (web #76) + 09c (mobile #78); every
  opened document now carries `pageCount` on both platforms. **Next: Phase 2 → 09d core analytics engine.**
- **Unit 09b DONE + MERGED (2026-06-13) — PR #77 squashed to main (e0b59a5), Issue #76 closed.** Sonnet TDD
  executor → fresh-context Opus reviewer = **APPROVE, no changes**. Diff (apps/web only): WebStore
  `setDocumentPageCount` facade + new `useCapturePageCount` fire-once hook + reader-page wiring; `usePdfDocument`
  untouched (already surfaced `numPages`). Tests: web-store-page-count (3) + use-capture-page-count (6). Verify
  green: typecheck 9 ✓ · test 133 web ✓ · lint 6 ✓. Reviewer validated the numPages 0→N effect-edge is correct.
  **Next: 09c (mobile reader → pdf.js bridge numPages).**
- **Unit 09a DONE + MERGED (2026-06-13) — PR #75 squashed to main (fac8873), Issue #74 closed.** Sonnet TDD
  executor → fresh-context Opus reviewer = **APPROVE, no changes**. Diff: `Document.pageCount?` + pure
  `withDocumentPageCount` (core), `setDocumentPageCount` set-once/idempotent use-case (store) + tests.
  Verify all green: typecheck 9 ✓ · test 467 (121 core + 97 store + 124 web + 102 mobile + 23 tokens) ✓ ·
  lint 6 ✓. apps/web, apps/mobile, packages/tokens byte-identical. **Next: 09b (web reader → pdfjs numPages).**
  Umbrella **Unit 09 (Rich analytics
  rollups / Stats tab)** SCORED COMPLEX → split by boundary like 03/04/05/06/07/08. **Product fork resolved
  (user, 2026-06-13):** per-book % + finish-ETA need a **total page count per Document**, which doesn't exist
  yet (`Document` has no `pageCount` — 04a deferred it; unit 05 never added it). User chose **"pageCount unit
  first"** (not defer) → Unit 09 now has **two sub-phases**: *Phase 1 — page-count capture (prerequisite):*
  **09a** core `Document.pageCount` + store `setDocumentPageCount` (this) → **09b** web reader captures pdfjs
  `numPages` → **09c** mobile reader captures it via WebView bridge (device-bound). *Phase 2 — analytics:*
  **09d** core stats engine (heatmap, time+pages, speed, time-of-day, per-book %, ETA — reuses 08a's
  current/longest streak) → **09e** web Stats tab (UI) → **09f** mobile Stats tab (UI, device-bound).
  09a design (mechanical defaults, no product invention): `pageCount?` optional on Document (backward-compat;
  `makeDocument`/`importDocument` untouched); pure `withDocumentPageCount(doc, n)` validates int ≥1 (RangeError
  else), no mutation; store `setDocumentPageCount(deps, docId, n)` is **set-once/idempotent** — missing doc →
  null/no write, same count → no write/no outbox, change → put + exactly one HLC outbox entry (op 'put', #2).
  pageCount is **intrinsic to the bytes** (docId = sha256) → collision-free cross-device, no LWW/`updatedAt`
  added (noted for unit-12 reconciler).
- **Unit 08c MERGED (2026-06-13) — PR #73 squashed to main (545ff44), Issue #72 closed, device-verified by
  user (Expo Go). Umbrella Unit 08 (Streaks + daily goal + freezes) COMPLETE** across all three slices:
  08a engine (#69) → 08b web (#71) → 08c mobile (#73). Mobile Today now renders 08a's `deriveHabitSummary`
  above Continue Reading: status-aware streak ember (lit/at-risk/broken + banked freeze pips) + today's goal
  ring (active min vs 20-min target). native-store has read-only `listSessions`/`getGoalConfig` only (#2/#5
  untouched); pure `present-habit.ts` byte-identical to 08b; `use-habit-summary.ts` gates ready/store + read
  errors → neutral view (#1); RN-svg + `useResolveClassNames` token colors (#6); derived on read never stored
  (#3). **Device-verify gotcha + fix (carry-forward):** token colors referenced ONLY via
  `useResolveClassNames(...)` (never as a literal `className`) are dropped by Tailwind's content scan → the
  class is un-compiled → `useResolveClassNames` returns undefined → react-native-svg falls back to a BLACK
  fill (invisible on dark). Fix: `@source inline("bg-streak-lit bg-streak-risk bg-text-muted")` in
  `apps/mobile/global.css` to force-emit them; restart Expo with `--clear`. **Any future RN token resolved
  only through useResolveClassNames must be safelisted this way.** Next: umbrella Unit 09 (Stats — longest
  streak / heatmap / time-of-day), not yet specced.
- **Unit 08c BUILT — PR open (Closes #72), branch feat/72-mobile-today-habit, awaiting device-verify + merge
  (2026-06-13).** Built inline by fully-context-loaded Opus (TDD on the seam; net-new RN ember+ring mirrored
  from 08b's polished components + a11y) → fresh-context Opus review = **APPROVE** (no invariant violations,
  no token leaks, presenter byte-identical). native-store gained read-only `listSessions`/`getGoalConfig`
  delegations only (no write/outbox — #2/#5 untouched); pure `present-habit.ts` is a verbatim copy of 08b's
  (17 Vitest cases) + new `native-store-habit.test.ts` seam test (3 cases); `use-habit-summary.ts` gates on
  `ready`/`store` + swallows read errors → neutral default view (#1); `streak-ember`/`goal-ring`/`habit-header`
  use react-native-svg + `useResolveClassNames`→ColorValue (no className colors / no arbitrary-value classes —
  #6); RN-native halo glow replaces web's CSS drop-shadow (shipped static, no motion dep). Derived on read
  never stored (#3). **Review-driven fix:** today-screen no longer full-screen-gates on `useContinueReading`
  loading — greeting + separator + HabitHeader (own skeleton) render immediately; only the Continue Reading
  card shows a scoped inline spinner (spec's "don't couple the two loading states"). typecheck ✓ · mobile
  test 15 files/102 ✓ · lint ✓ · web/core/store/tokens byte-identical to main. **DEVICE-VERIFY (user, Expo
  Go, before merge):** no-sessions dim ember + `0/20` ring; read a PDF → ring fills + ember lights; light/dark;
  freeze pips after a ≥5-day run; habit header coexists with Continue Reading (independent loading).
- **Unit 08c SPECCED (2026-06-13) — Issue #72, branch feat/72-mobile-today-habit (not yet cut), spec
  specs/08c-mobile-today-habit.md. Route standard, UI unit, DEVICE-BOUND.** Final slice of umbrella Unit 08:
  mirrors 08b onto the Expo/uniwind Today screen, reading the same 08a `deriveHabitSummary`. native-store gains
  read-only `listSessions`/`getGoalConfig` delegations (no `setGoalConfig` — #2/#5 untouched); pure
  `present-habit.ts` is a verbatim copy of 08b's (Vitest-tested) + `use-habit-summary.ts` (gates on `ready`/
  `store`, read errors → neutral view, #1) + `streak-ember`/`goal-ring`/`habit-header` (react-native-svg +
  uniwind `useResolveClassNames` token colors, #6) wired into today-screen.tsx. Derived on read never stored
  (#3). Platform deltas from 08b: useResolveClassNames not className colors; `{store,ready}` store; no CSS
  drop-shadow/blur on RN; **hook + components device-verified, not render-tested** (no headless RN renderer —
  same precedent as 07c/06d). Dispatch route: Sonnet TDD (present-habit + native-store seam) → frontend-design
  (net-new RN ember+ring) → impeccable → fresh-context Opus review → branch/commit/PR "Closes #72" →
  Device-verify (Expo Go) before merge. **Awaiting user "dispatch".**
- **Unit 08b MERGED (2026-06-13) — PR #71 squashed to main (8eec4be), Issue #70 closed, browser-verified
  by user.** Web Today tab now renders 08a's `deriveHabitSummary` above Continue Reading: streak ember
  (lit/at-risk/broken + banked freezes) + today's goal ring (active min vs 20-min target). Built test-first
  + frontend-design + impeccable → fresh-context Opus review APPROVE. web-store gained read-only
  `listSessions`/`getGoalConfig` (no `setGoalConfig` — #2/#5 untouched); pure `present-habit.ts` +
  `use-habit-summary.ts` (read errors → neutral view, #1) + `streak-ember`/`goal-ring`/`habit-header`
  wired into today-page.tsx. Derived on read never stored (#3); token-only (#6); a11y (role=img,
  aria-label, decorative SVG aria-hidden, motion-safe). typecheck ✓ · 124 web tests ✓ · lint ✓;
  apps/web-only diff. **Next:** 08c — mobile Today streak ember + goal ring (device-bound, uniwind/RN),
  the final slice of umbrella Unit 08. Awaiting user "spec 08c".
- **Unit 08b SPECCED (2026-06-12) — Issue #70, branch feat/70-web-today-habit (not yet cut), spec
  specs/08b-web-today-habit.md. Route standard, UI unit.** Second slice of umbrella Unit 08, after 08a
  (#69 MERGED). Wires 08a's `deriveHabitSummary` into the web **Today** tab: a **streak ember**
  (current streak + lit/at-risk/broken + banked freezes) and **today's goal ring** (active min vs 20-min
  target), rendered above Continue Reading. Boundary apps/web ONLY — no new dep, no write path (read-only:
  exposes `listSessions`/`getGoalConfig` on web-store, NOT `setGoalConfig` — that's Settings/17). New:
  pure `present-habit.ts` (headless-testable view-mapper — clamp ring, round minutes, pluralize, warm
  non-guilt copy) + `use-habit-summary.ts` hook (today = `localDayOf(Date.now(), -getTimezoneOffset())`,
  Promise.all sessions+goal, swallow read errors → neutral broken/empty view per invariant #1) +
  `streak-ember.tsx`/`goal-ring.tsx`/`habit-header.tsx` components, wired into today-page.tsx. Longest
  streak/heatmap/time-of-day stay OUT (Stats/09). streak-lit/streak-risk tokens already in packages/tokens
  (verified — no tokens change). UI unit → **frontend-design** (net-new ember+ring) → **impeccable** →
  fresh-context **code-review**. Tests: pure present-habit suite + jsdom TodayPage render (inject store
  stub, mirror today-continue-reading.test harness). **Next:** dispatch (Sonnet TDD executor →
  fresh-context Opus reviewer), then 08c (mobile, device-bound).
- **Unit 08a MERGED (2026-06-12) — PR #69, Issue #68 closed, spec specs/08a-streak-goal-engine.md.
  Route standard.** Dispatched Sonnet TDD executor → fresh-context Opus review (**APPROVE**, no
  blocking/should-fix; algorithm hand-traced, invariants #1–#4 verified). 205 tests green (113 core /
  92 store); typecheck + lint clean; CI verify pass. Built: core `streak.ts` (`deriveStreak` /
  `deriveTodayGoal` / `deriveHabitSummary` / `nextLocalDay` / `activeMsByDay`) + store `goal-config.ts`
  (`getGoalConfig`/`setGoalConfig`). **Next:** spec/build **08b** (web Today goal ring + streak ember
  — UI unit → frontend-design + impeccable before review), then 08c (mobile, device-bound).
  Umbrella **Unit 08 (Streaks + daily goal + freezes)**
  SCORED COMPLEX → split by boundary like 03/04/05/06/07: **08a** shared brain (core derivation + store
  goal config — this) → **08b** web Today goal ring + streak ember → **08c** mobile Today goal ring + streak
  ember (device-bound). **Design RESOLVED (user, 2026-06-12):** (1) streak rule = **any reading** (any local
  day with a real session extends the streak; goal-independent; ring is separate exceedable progress);
  (2) daily goal = **20 min active reading** default, stored as a syncable `GoalConfig` record (HLC LWW),
  configurable later in Settings (17); (3) freezes = **banked, auto-consumed**, both **derived** from session
  history (no mutable counter) — defaulted rule: earn 1 per 5 consecutive read-days, cap 2, a missed non-today
  day auto-consumes one, today-unread is pending (no break/consume). 08a = pure core `deriveStreak` /
  `deriveTodayGoal` / `deriveHabitSummary` over `ReadingSession[]` + a caller-supplied `today` local-day (no
  clock in core, mirrors 07a) + store `getGoalConfig`/`setGoalConfig` (single mutable record + one outbox
  entry). Fully headless-testable; mirrors 07a's core+store shape.
- **Umbrella Unit 07 (session/idle tracking engine) COMPLETE (2026-06-12).** 07a (#62/#63, shared brain) →
  07b (#64/#65, web wiring) → 07c (#66/#67, mobile wiring) all MERGED to main. The reader now produces a real
  append-only session log on both clients; stats/aggregation are downstream concerns (units 08/09).
- **Unit 07c MERGED (2026-06-12) — PR #67 squash-merged to main (d442c88), #66 closed, branch deleted.**
  Standard route: Sonnet TDD executor → fresh-context Opus reviewer = **APPROVE** (zero blocking/should-fix;
  invariants #1–#4, boundary purity, RN hook hazards all checked) → user device-verify in Expo Go green
  (idle split on >60s background, same-bout on <60s flip, final-bout flush on back-out) → CI green → squash-merge.
  Implementation = exactly the spec: pure `session-tracker.ts` (@ember/core only) + `use-session-tracking.ts`
  shell hook (15s heartbeat, AppState gating replacing visibilitychange, tz capture, fire-and-forget
  recordSession) + native-store `recordSession(flushed)` + native-clock `newId()` + additive taps in
  reader-screen. No `pagehide` (effect-cleanup is the sole flush path); shell hook device-verified, not
  unit-tested (no headless RN renderer — 06d precedent). test ✓ (mobile 82, web 103) · typecheck ✓ · lint ✓.
- **Unit 07c SPECCED (2026-06-12) — Issue #66, branch feat/66-mobile-reader-session-tracking (not yet cut),
  spec specs/07c-mobile-reader-session-tracking.md.** Standard route (single boundary apps/mobile, no new dep,
  behavioral). Final slice of umbrella Unit 07. Mirrors 07b but: `AppState` replaces `visibilitychange`
  (foreground=visible; background/inactive caps+pauses, foreground resumes); NO `pagehide` (effect-cleanup is
  the sole, reliable flush path); the shell hook `use-session-tracking.ts` is **device-verified in Expo Go, not
  unit-tested** (no headless RN renderer — same precedent as `use-reading-position` 06d). Touches: native-clock
  (+`newId()`), native-store (+`recordSession(flushed)` surface), new pure `session-tracker.ts` (copy of web's,
  imports only `@ember/core`), new shell hook, additive taps in reader-screen (`handlePageChange`→`onPage`,
  `handlePosition`→`onActivity`). Tests: pure tracker suite + native-clock `newId` + native-store-session
  (no hook test). **Next:** dispatch (Sonnet TDD executor → fresh-context Opus reviewer).
- **Unit 07b MERGED (2026-06-12) — PR #65 squash-merged to main (cb84159), #64 closed, branch deleted.**
  Branch feat/64-web-reader-session-tracking. Standard route: Sonnet TDD executor → fresh-context Opus review
  (APPROVE, no blockers) → user browser-verify green → squash-merge. Wired 07a's pure `reduce` + store
  `recordSession` into the web reader: a pure `session-tracker.ts` seam (holds `TrackerState`, applies `reduce`,
  routes each flushed session to `onFlush` — injected clock, no DOM/timers) under a `use-session-tracking.ts`
  platform-shell hook (15s heartbeat while visible; `visibilitychange` caps/resumes the bout; `close()` flushes
  on unmount + `pagehide` (best-effort); tz = `-getTimezoneOffset()`; `recordSession` fire-and-forget, errors
  swallowed per invariant #1). Additive to 06b's position-save seams in reader-page. Web-store gained a
  `recordSession(flushed)` surface; web-clock gained `newId()` (session record id, distinct from `newOutboxId`).
  No new dep; core/store unchanged except the additive web-store surface. 103/103 tests (18 new across 4 files),
  typecheck + lint clean. **Next:** Unit 07c — mobile reader event wiring (device-bound, WebView bridge), the
  final slice of umbrella Unit 07.
- **Unit 07a MERGED (2026-06-12) — PR #63 squash-merged to main (785c7da), #62 closed, branch deleted.**
  Branch feat/62-session-tracking-engine. TDD executor (Sonnet) → fresh-context Opus review
  = **APPROVE WITH NITS, no blockers**; all 3 nits applied (defensive `pages` copy in `finalize`,
  dead-branch cleanup, stronger close-purity test). CI `verify` green. Shipped: core `session.ts`
  (`reduce`/`localDayOf`/`makeReadingSession`) + store `sessions.ts` (`recordSession`/`listSessions`),
  core 87 tests / store 86. **Next:** build 07b (web reader event wiring → `reduce`/`recordSession`),
  then 07c (mobile).
- **Unit 07a SPECCED (2026-06-12) — Issue #62, branch feat/62-session-tracking-engine, spec
  specs/07a-session-tracking-engine.md. Route standard.** Umbrella **Unit 07 (session/idle tracking
  engine)** SCORED COMPLEX → split by boundary like 03/04/05/06: **07a** shared brain (core session
  model + idle/active-time reducer + local-day stamping + store append-only persistence — this) →
  **07b** web reader event wiring → **07c** mobile reader event wiring (device-bound, WebView bridge).
  **Design RESOLVED (user, 2026-06-12):** (1) idle threshold = **60s** (gap >60s ends a bout);
  (2) one record **per reading bout** (continuous engaged reading), not a fine-grained event log;
  (3) a bout crossing local midnight **splits into one record per local day** (invariant #4). Plus a
  defaulted rule (noted in spec): **zero-active slices dropped** (open→close with no engaged time is
  not a session). 07a = pure `reduce(state, event)` reducer (open/activity/page/close; caller supplies
  wall ms + tz offset + a ~15s heartbeat — no clock/timers in core) emitting `FlushedSession`s, a
  `makeReadingSession` HLC factory, and store `recordSession` (append-only, uuid-keyed, one outbox
  entry) / `listSessions(filter?)`. Fully headless-testable; mirrors 06a's core+store shape. Next:
  build 07a (TDD executor → fresh-context Opus review), then 07b.
- **Unit 06e MERGED (2026-06-12) — PR #61 squash-merged to main (2dfe1c0), #60 closed, branch deleted,
  DEVICE-VERIFIED by user (Expo Go).** Issue #60, spec specs/06e-mobile-today-tab-nav.md. Route standard
  (single boundary apps/mobile; net-new UI → impeccable design pass → fresh-context Opus review = APPROVE,
  no blockers; device-bound like 02d/03c/05b/06d). The mobile mirror of 06c — **completes umbrella Unit 06.**
  Shipped: expo-router **bottom Tabs** shell (`app/(tabs)/_layout.tsx` token-driven via useResolveClassNames
  + `(tabs)/index.tsx` Today + `(tabs)/library.tsx` relocated LibraryScreen; deleted `app/index.tsx`; reader
  stays a full-screen stack route OUTSIDE the tabs); native **Today** screen (time-of-day greeting +
  Continue Reading card, vertically-centered composition) whose card resumes the most-recently-read doc
  (06a/06d positions); native-store `listReadingPositions` (06d deferred it; delegates to @ember/store);
  pure `selectContinueReading` (mirrors web — drop orphans, sort by recency) + `use-continue-reading` hook
  (Promise.all, cancel-flag, swallows read errors per invariant #1); display-only `format-title` filename
  cleanup on the Today card. Product carried over from 06c (Today = Continue Reading only — no streak/goal/%;
  tabs = Today + Library only; ThemeControl stays in Library header). **Deviations from spec (justified):**
  (a) `@expo/vector-icons` NOT installed → hand-rolled tab icons in `react-native-svg` (no new dep, the more
  invariant-safe path — spec permits preferring a present pkg); (b) executor's `text-white` on the Resume
  button corrected to the `on-accent` token (invariant #6) during dispatch. Design pass (this session, on the
  device screenshot): cleaned the filename title, vertically-centered the composition to fill the void, refined
  the Resume button (play glyph, proper rounded button vs flat pill). typecheck 9 ✓ · test (incl. new
  select-continue-reading + format-title suites) ✓ · lint 6 ✓ · `expo export -p android` → "Exported: dist".
  Tests pure `.ts` (mobile has no React test renderer); screens/card/tab bar device-verified.
- **Dedup-hoist follow-up (own micro-unit, defer — do NOT widen 06e):** `selectContinueReading` +
  `ContinueReadingItem` now exist byte-identically in apps/web AND apps/mobile. Promote the pure selector to
  `packages/core` (or a shared today/ module) and have both clients import it, retiring both copies. Same
  class as the deferred native-clock/format-bytes dedup.
- **Import-time title normalization follow-up (own micro-unit, defer — do NOT widen 06e):** imported
  `Document.title` is the raw filename (e.g. `_OceanofPDF.com_The_Forgotten_Trinity_-_James_R_White`). 06e's
  design pass added a DISPLAY-ONLY `apps/mobile/src/today/format-title.ts` (strip download-site prefix,
  underscores→spaces, ` - `→em-dash, drop `.pdf`) used only on the mobile Today card — so Library/reader (web
  AND mobile) still show the ugly filename. Proper fix: normalize the title at IMPORT time in
  `importDocument` (packages/store, with the pure transform in packages/core) so every surface benefits and
  the per-client display helper can be retired. Touches core+store (a second boundary) → its own unit, not 06e.
- **Unit 06d MERGED (2026-06-12) — PR #59 squash-merged to main, #58 closed, branch deleted.** Mobile reader
  capture/restore (mirror of 06b). Shipped: native-store `saveReadingPosition`/`getReadingPosition` (listReadingPositions
  deferred to 06e like 06b→06c); a PURE `reading-position-controller` (resume-once + generation-token stale guard +
  debounced save, injected timers — mobile has no React test renderer, so logic is headless-testable) under a thin
  device-verified `use-reading-position` hook; WebView bridge capture `{type:'position',page,offset}` (offset math IN the
  WebView) + restore via extended `{type:'gotoPage',page,offset}`; reader-webview `onPosition` + one-shot `resumeTo`
  prop; reader-screen wiring. 14 new headless tests (store seam + pure controller), red-before-green. Route standard:
  Sonnet TDD → fresh-context Opus review = APPROVE (no blockers; 2 doc-comment nits fixed). Gates green incl.
  `expo export -p android`; invariants #1/#2/#5 held; core/store/web byte-identical. Device-verified (Expo Go): scroll
  mid-doc → reopen resumes page+offset; paged resumes page; never-read → page 1; force-quit/relaunch still resumes.
- **Umbrella "06d mobile reader resume + native Today" SCORED COMPLEX → split by visible result (2026-06-12),
  exactly like the web 06b/06c split.** It bundled two visible results in apps/mobile: (a) reader capture/restore
  (behavioral, WebView bridge — shipped as 06d) + (b) native Today screen + tab-nav shell (net-new UI + expo-router
  restructure — deferred as 06e).
- **Unit 06c MERGED (2026-06-12) — PR #57 squash-merged to main (044b464), #56 closed, branch deleted.
  Issue #56, spec specs/06c-web-today-tab-and-router.md. Route standard (single boundary apps/web; net-new UI →
  frontend-design + impeccable → fresh-context Opus review).** Web app now has a real navigation shell + a
  habit-forward home. Both parked open questions were RESOLVED with user before speccing:
  (1) **Today = Continue Reading card only** — streak ember + goal ring omitted until the session log exists
  (no fake/dead UI); no "% through" (Document has no page count yet → card shows "Page N"). (2) **Tab nav
  = react-router** (`react-router@7.17.0` exact pin, v7 unified pkg; URL tabs /today, /library, /read/:docId,
  `/`→/today, catch-all→/today) — migrated the `openDocId` state switch onto routes. Built: exposed
  `listReadingPositions` on web-store (delegates to @ember/store; 06b deferred it); pure `selectContinueReading`
  selector (join position→doc by id, drop orphans, sort updatedAt desc); use-continue-reading hook (Promise.all,
  cancel-flag, swallows read errors per invariant #1); TodayPage (time-of-day greeting + date line) +
  ContinueReadingCard (bookmark-stripe aesthetic, Fraunces title + "Page N" + Resume; gentle empty-state nudge
  to /library) + AppShell top-nav (Ember wordmark + Today/Library NavLinks w/ animated accent underline +
  ThemeControl extracted to shared theme/theme-control.tsx). App holds only <Routes>+<Toaster/>; BrowserRouter
  in main.tsx (tests inject MemoryRouter). ReaderRoute keeps key={docId} (06b resume-once guard). Router
  migration churned app-navigation.test (wrap MemoryRouter) + library-page.test (theme assertion → app-shell.test).
  Read-only — no merge/write path (mergeReadingPosition untouched; #2/#5). Built TDD (Sonnet) → frontend-design
  + impeccable on the 3 net-new surfaces → fresh-context Opus review = APPROVE (token-only UI confirmed against
  theme.css for light+dark; nit: redundant Wordmark aria, non-blocking). typecheck/test/lint clean (85 web
  tests); core+store byte-identical. Browser-verify green (user). **Next: 06d** mobile reader resume + native
  Today (device-bound, like 02d/03c).
- **Unit 06b MERGED (2026-06-11) — PR #55 squash-merged to main (7d031c4), #54 closed, branch deleted.**
  Web reader resumes where you left off: wired 06a's saveReadingPosition/getReadingPosition into the reader
  (web-store surface mirrors getPdfBytes; pure computePageOffset/resumeScrollTop helpers; useReadingPosition
  hook — resume once-per-docId after ready, ≈600ms debounced last-write save, flush-on-unmount, errors
  swallowed per invariant #1; reader-page getCurrent/onResume/scheduleSave for scroll+paged; key={docId}
  remount per doc). Built TDD (Sonnet) → fresh-context Opus review = PASS; applied 2 review fixes pre-merge
  (flush-on-unmount per spec wording; key={docId} stale-closure guard for 06c). Browser-verify green (user).
  typecheck/test/lint clean (72 web tests); core+store byte-identical. listReadingPositions NOT exposed on
  web-store yet (06c needs it). **Next: 06c** — must resolve its two open questions below first.
- **Unit 06b SPECCED (2026-06-11) — Issue #54, Closes #54, branch feat/54-web-reader-capture-restore,
  spec specs/06b-web-reader-capture-restore.md. Route standard.** The umbrella "06b" bundle (web reader
  capture/restore + Today card + tab nav) **scored COMPLEX → re-split**: ambiguity = 2 (Today's content is
  blocked on session data that doesn't exist yet → streak ember / goal ring undefined; tab-nav router-vs-state
  undecided) + two extra visible results beyond the reader wiring. Split like 04/05: **06b** = web reader
  capture/restore ONLY (apps/web; wire 06a's saveReadingPosition/getReadingPosition into the reader — resume
  on open, debounced last-write save on page/scroll change; no new dep; behavioral, no net-new visual surface
  → standard executor + Opus review, NO frontend-design). Deferred: **06c** web Today tab + Continue Reading
  card + tab-nav shell, **06d** mobile reader resume + native Today. **Open questions for 06c (resolve at its
  spec time):** (1) what renders on Today now — Continue Reading card is ready (06b provides positions) but
  streak ember + goal ring need the session log (later unit), so are they placeholders/omitted? (2) tab nav =
  state-switch (current App.tsx style, no dep) vs react-router (new dep)? per ui-context web = sidebar/top nav.
  06b contract resolved in-spec: offset = within-page 0..1 (scroll mode from page rect; paged mode = 0); save
  debounced ≈600ms; resume once per docId after ready. Pure scroll-math helpers unit-tested headlessly
  (jsdom = 0 layout); pixel accuracy browser-verified.
- **Unit 06 SCORED COMPLEX → split by boundary (2026-06-11).** Build-plan 06 (Reading position + resume:
  page+offset capture + Today "Continue Reading" card) crosses 4 boundaries (core position model + the
  furthest-page conflict-merge, store syncable record, web UI + first Today surface, mobile UI) → COMPLEX.
  Split like 04a/b/c & 05a/b/c: **06a** core `ReadingPosition` shape + `mergeReadingPosition` (first piece
  of the shared conflict-merge engine, invariant #5) + store `saveReadingPosition`/`getReadingPosition`/
  `listReadingPositions` (#52 — **MERGED**, PR #53, CI verify ✓ 57s, branch deleted) → **06b** web reader
  capture/restore → **06c** web Today tab + Continue Reading card + tab-nav shell → **06d** mobile
  (device-bound, WebView position bridge + native Today). Route 06a = **standard** (core+store, pure TS, no new dep; mirrors 04a). Spec:
  specs/06a-reading-position-model.md, branch feat/52-reading-position-model.
  **Design RESOLVED (user, 2026-06-11):** (1) LOCAL save = last-write (literal current position, can move
  backward → resume-where-you-left-off); furthest-page MERGE runs only at cross-device reconcile (unit 12).
  (2) Merge tie-break: furthest page → greater within-page offset → HLC last-write-wins (each position
  record carries an encoded-HLC `updatedAt`). Position record keyed by docId (one per document); each save
  writes record + one outbox entry; scroll-save throttling deferred to 06b/06c UI.
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
- **Unit 04c (#40) MERGED** — PR #41 merged to main (CI verify ✓ 52s, commit 7aecb4e), branch deleted,
  DEVICE-VERIFIED by user (pick → import → toast → reload-persist + dedupe + non-PDF reject + light/dark
  re-theme all ✓), throwaway dev harness removed. mobile import + Library list (apps/mobile).
  **Unit 05 SPLIT + specced (2026-06-09):** build-plan unit 05 (PDF reader on both clients) scored
  **COMPLEX** — crosses web+mobile, two new render deps, AND an unresolved open question → split into
  **05a** web reader (#42, this — specced) → **05b** mobile reader (device-bound, react-native-pdf render +
  headless pdf.js text extraction). Web first: pdf.js is the reference text engine 05b's mobile contract is
  measured against. Umbrella issue #5; sub-issue #42. Spec: specs/05a-web-pdf-reader.md, route **standard**.
  **Open question RESOLVED (user):** mobile extracts its text layer with the **same pdf.js engine**
  (react-native-pdf renders pixels; headless pdf.js extracts text) → identical extraction = highlight-anchor
  parity (unit 10) for free. Consequence: the shared text-layer *shape* is promoted to `packages/core` in
  **05b** (once both clients proven identical), NOT in 05a — 05a keeps text-layer code in apps/web.
  05a scope: pdfjs-dist (6.0.227) reader — continuous-scroll default + paged toggle, virtualized page render,
  selectable text layer, reader theme (paper/sepia/night) independent of app chrome, clickable Library rows +
  state-based view switch (no router dep). Out: reading-position/resume (unit 06), highlights (unit 10) —
  opens at page 1. UI unit → frontend-design + impeccable before review.
  **STATUS: BUILT (Sonnet, TDD: 44 web tests — 7 page-visibility pure helpers, 7 reader-page behaviour,
  1 app-navigation, +29 pre-existing) → impeccable polish (a11y: page-indicator live region now announces
  ONLY in paged mode — scroll mode updates currentPage every tick so a persistent live region spammed SRs;
  + hairline `border-line` on page cards so sheets read as discrete paper on all 3 reader themes) →
  fresh-context review (Opus) = **APPROVE-WITH-NITS**, NO blockers. Applied both SHOULD-FIX: App.tsx title
  lookup moved from a useState-initializer side-effect → a proper `useEffect([store, docId])` w/ cancel
  guard; paged-mode keydown effect given an explicit dep array (`[currentPage,numPages,onPageChange]`) +
  inlined nav, killing per-render listener churn. Gates: typecheck 9 ✓ · test 44 web ✓ · lint 6 ✓.
  packages/ byte-identical to main (no pdf.js leak into core/store; text-layer shape NOT promoted — that's
  05b). Dep added: pdfjs-dist@6.0.227 (ESM; worker via `?url` Vite import; no allowBuilds entry needed).
  Files: src/reader/{pdf,use-pdf-document,page-visibility}.ts + {pdf-page,reader-page}.tsx + 3 test files;
  store/web-store.ts (+`getPdfBytes`→blobs.get, ONLY store change); App.tsx (+openDocId state-nav);
  document-row.tsx/library-page.tsx (rows clickable +onOpen). **Reviewer NITs deferred:** (1) exported+tested
  `mostVisiblePage` is unused — ScrollReader uses an inline IntersectionObserver topmost-visible heuristic;
  wire it or drop the dead export in a later polish (browser-verify indicator tracking). (2) dpr/scale calc
  duplicated in pdf-page. **Follow-up (own micro-unit, packages/tokens — don't widen 05a):** page-card
  `border-line`/paged-button `bg-line` use the APP-chrome `line` token (not redefined under
  `[data-reader-theme]`), so page edges/hover follow app chrome, not the reader theme. Add reader-scoped
  `reader-line`/`reader-muted` tokens. (reader-bg/reader-text themselves track the reader theme correctly.)
  **POST-VERIFY FIX (browser bug found by user): the pdf.js text layer rendered as OPAQUE, unscaled,
  misaligned black text stamped over each page.** Root cause: pdf.js v6 `TextLayer.render()` only sets
  per-glyph vars (`--font-height`/`--scale-x`/`--rotate`) and sizes glyphs as
  `calc(var(--total-scale-factor) * --font-height)` — the CALLER must (a) apply the `.textLayer` CSS
  (transparent color + absolute positioning) and (b) set `--total-scale-factor` on the container. We did
  neither. Fix (commit 81137e5): styles.css gained the structural `.textLayer` rules from pdfjs-dist v6
  (unlayered so they beat Tailwind utilities; native `::selection` kept so selection stays visible);
  pdf-page.tsx sets `--total-scale-factor` to the CSS render scale + uses `className="textLayer"`, dropping
  the hand-rolled inline positioning. Gates green; user BROWSER-VERIFIED (canvas-only, text selects + tracks
  glyphs). **Carry-forward: any pdf.js text layer needs BOTH the `.textLayer` CSS and `--total-scale-factor`
  set by the caller — `TextLayer.render()` alone is not enough.**
  **Unit 05a (#42) MERGED** — PR #43 merged to main (merge commit 26dd9b0), branch deleted, BROWSER-VERIFIED
  by user (render/scroll, paged toggle, text selection, paper/sepia/night, scanned PDF no-text-layer + no
  error all ✓).
- **Unit 05b SPECCED (2026-06-09) — mobile PDF reader (#44, umbrella #5), route standard.** Spec:
  specs/05b-mobile-pdf-reader.md. **ENGINE PIVOT (user-confirmed this session): pdf.js in a
  `react-native-webview`, NOT react-native-pdf.** Rationale: ONE engine for render+text = exact 05a parity
  (unit-10 highlight anchors fall out free) + stays in Expo Go (webview is bundled there; react-native-pdf is
  a native module → would have forced a custom dev client / EAS build). **Supersedes the architecture.md
  `react-native-pdf` pin** — update that row + mark the mobile-text-extraction Open Question resolved IN THE
  05b PR. **05 SPLIT FURTHER (user): 05b = render + reader UI only; 05c = structured text-geometry extraction
  across the RN↔WebView bridge + promote the shared text-layer shape to packages/core (the unit-10 parity
  piece).** 05b scope (apps/mobile only): tappable DocumentRow → expo-router `/reader/[id]` → ReaderScreen
  (native uniwind toolbar: back/title/`page X of N`/mode/theme) hosting a WebView pdf.js reader (static
  `assets/reader/` HTML, base64 bytes over postMessage, scroll default + paged toggle, reader theme
  paper/sepia/night INSIDE the WebView — uniwind has no reader-theme axis, so native chrome stays app-themed).
  Only store change: additive `getPdfBytes` on native-store (mirror 05a web-store). New deps: react-native-webview
  (`expo install`, Expo-Go-bundled) + pdfjs-dist@6.0.227 (pin = web). Reader is real UI → no throwaway dev
  harness; device-verify = open a PDF in Expo Go. Tests: native seams only (getPdfBytes + any pure helper) —
  WebView/render is device-bound. Build-validate from official docs (not memory): the expo-asset/WebView
  asset-loading mechanism, pdf.js worker in a WebView, base64 bridge size.
  **STATUS: MERGED → done. BUILT (Sonnet executor, cut off by a session limit → orchestrator finished the gates)
  → fresh-context review (Opus) = CHANGES-REQUESTED → fixed → re-review = B1/S1 RESOLVED → DEVICE-VERIFIED (user,
  Expo Go, after the device-only fixes below) → committed/PR/merged. Gates: typecheck 9 ✓ · test 44 web +
  34 mobile ✓ · lint 6 ✓ · `expo export -p android` → Exported: dist ✓.**
  - **3 DEVICE-ONLY BUGS (none catchable by any local gate — WebView runtime only; found via the user's Expo Go
    pass + the in-WebView error→RN instrumentation we added):**
    1. **ES modules + blob workers do NOT run from an opaque origin.** `WebView source={{ html }}` loads the doc
       with an `about:blank`/opaque origin; pdf.js v6 is ESM-only, so the `<script type=module>` (which posts
       `ready`) was SILENTLY skipped → infinite spinner, no error. **Fix: give the doc a real origin —
       `source={{ html, baseUrl: 'https://ember.reader/' }}`.** This also unblocks the blob-URL worker.
       **Carry-forward: any react-native-webview hosting ESM/module scripts or blob workers MUST set a real
       `baseUrl`; `source={{html}}` alone gives an opaque origin that silently skips modules.**
    2. **Redeclaration crash.** `const { GlobalWorkerOptions, getDocument, TextLayer } = pdfjsLib` collided with
       pdf.mjs's own top-level exported bindings of those names in the SAME inline-module scope → "Identifier
       GlobalWorkerOptions has already been declared". **Fix: reference `pdfjsLib.<name>` directly; never
       destructure pdf.mjs's exported names into local consts in the inlined module.**
    3. **Silent hangs are undebuggable on device** → added an instrumentation layer (kept): a classic pre-module
       `<script>` defines `postToRN` + global `error`/`unhandledrejection` handlers; the reader posts `stage`
       messages (webview-booted→decoding→getDocument); RN has a 25s hang watchdog + shows the real failure reason
       in the error notice. THIS is what surfaced bugs 1 & 2. **Carry-forward: instrument WebView readers to
       report errors/stages back to RN — local gates can't see WebView-runtime failures.**
    - Also hardened the worker (real module `Worker` via `workerPort`, fallback to `workerSrc`). Reminder: the
      `bundle-pdfjs.mjs` comment + any code INSIDE the HTML template literal must avoid backticks/`${` (they
      close the template) — bit us twice this session.
  - **ASSET MECHANISM CHOSEN: inline pdf.js as a string, NOT expo-asset URIs.** `scripts/bundle-pdfjs.mjs`
    (run by `predev` + `typecheck`) reads `node_modules/pdfjs-dist/build/{pdf,pdf.worker}.mjs` and writes them as
    string consts into `src/reader/pdf-js-content.ts` (GITIGNORED, regenerated). `build-reader-html.ts` embeds
    pdf.mjs as an inline `<script type=module>` + the worker as a Blob URL (`GlobalWorkerOptions.workerSrc`),
    served via `WebView source={{ html }}`. No file:// URI resolution, no Metro asset config, fully offline.
    Trade-off: ~3MB inlined → 11MB android bundle (acceptable; file-stream optimization deferred to 05c/perf).
  - **BLOCKER found+fixed in review (B1 — would've shipped a permanent spinner): RN→WebView `postMessage` is
    NOT queued; the in-page `message` listener only attaches AFTER the 3MB pdf.js module evaluates, so the
    initial `load` raced and was dropped → no `ready` → stuck loading. Fix: a `bootReady` handshake — the page
    posts `bootReady` once its listener is attached; RN gates all load/mode/theme posts on it and flushes on
    receipt.** Carry-forward: ANY RN↔WebView bridge that posts INTO a WebView needs a readiness handshake — the
    native postMessage has no queue. (S1: removed dead `onWebViewRef`/no-deps effect. NIT: in-HTML `setMode`
    now stores the requested mode even pre-load so `loadPdf`→`applyMode` can open directly in paged later.)
  - **Tooling fixes this unit:** eslint config — widened the mobile React-version pin glob to `mjs,cjs` so the
    new Node build script skips the ESLint-10 react-version-detection crash; `.gitignore` += `src/reader/pdf-js-content.ts`.
    **CI note (follow-up): `expo export` does NOT run `predev`, so any CI export step must run `bundle-pdfjs`
    (or `typecheck`) first or a fresh clone exports against the missing generated file.**
  - **NIT (deferred, WebView-local — fine per spec's invariant-#6 exception): sepia/night page-border hexes
    (#D4C5A6 / #2A2420) in build-reader-html are invented (not in tokens/ui-context); paper border = the `line`
    token. Could document in ui-context.md later.**
- **Unit 05c SCORED COMPLEX → split by boundary (2026-06-10).** Build-plan 05c (structured text-geometry
  extraction across the RN↔WebView bridge + promote the shared text-layer shape to packages/core, the
  unit-10 parity piece) crosses 3 boundaries (core shape + web extract + mobile WebView→RN bridge) AND the
  shape was undesigned → COMPLEX. Split like 03a/b/c & 05a/b: **05c-1** core shape + pure normalizer (#46,
  this — SPECCED) → **05c-2** web extraction + golden parity test (apps/web) → **05c-3** mobile
  WebView-extract + RN bridge, device-bound (apps/mobile; the literal highlight-anchor parity payoff for #10).
  **Design RESOLVED (user, 2026-06-10):** (1) per-item granularity — one entry per pdf.js TextContent item
  carrying `str` + bbox + reading-order `index` (unit 10 resolves `(page,startChar,endChar)`→rects from these);
  (2) coordinates normalized 0..1 of the page, top-left origin, y-down → web & mobile feeding the same pdf.js
  output through the SAME core function produce identical geometry **by construction** (the parity property),
  consistent with the reading-position relative-offset model. 05c-1 route = **standard** (single boundary
  packages/core, no new dep, pure TS — no pdf.js/DOM import; input is a minimal `RawTextItem` projection,
  mirroring the Hasher/SqliteDriver port pattern). Spec: specs/05c-core-text-geometry.md. Files: new
  `packages/core/src/text-geometry.ts` (+ barrel line) + `src/tests/text-geometry.test.ts` (fixture-based,
  no pdf.js). **05c-1 BUILT (2026-06-10) — PR #47 open, Closes #46.** TDD executor (Sonnet) → fresh-context
  Opus review = APPROVE (nits only, none blocking). `normalizePageText()` + the promoted shape shipped;
  15 fixture tests incl. the scale-independence parity property; typecheck/test(45)/lint all green; core
  purity held (zero imports). **05c-1 MERGED (2026-06-10) — PR #47 squash-merged, #46 closed, branch deleted, main synced.**
  - **05c-2 SPECCED (2026-06-10) — Issue #48, Closes #48, branch feat/48-web-text-geometry, spec specs/05c-web-text-geometry.md.**
    Route **standard** (single boundary apps/web; pdfjs-dist already a web dep — no new dep; ambiguity resolved with user).
    apps/web produces the core geometry shape from real pdf.js + a **golden parity fixture captured from real pdf.js (Node
    legacy build)** — committed `test-fixtures/{sample.pdf,raw-textcontent.json,expected-geometry.json}` become the contract
    05c-3 (mobile) diffs byte-for-byte. New `page-geometry.ts` adapter (filters TextMarkedContent, type-only pdf.js import →
    `normalizePageText`); `pdf-page.tsx` fires optional `onTextGeometry?(geometry)` from the live render path (no consumer
    yet — unit 10's seam); `capture-geometry.mjs` one-time generator mirroring mobile `bundle-pdfjs.mjs`. **Design RESOLVED
    (user, 2026-06-10):** (1) golden source = real-pdf.js Node capture (not hand-authored — faithful for the byte-diff
    contract); (2) wire via optional callback now (not deferred). Tautology guard: golden snapshot = regression lock;
    independent hand-computed spot-checks (top→small y, bottom→large y) validate the golden itself.
  - **05c-2 MERGED (2026-06-10) — PR #49 squash-merged, #48 closed, branch deleted, main synced.** Built by Sonnet TDD
    executor → fresh-context Opus high-effort code-review = **APPROVE, no correctness bugs**. Verify all green: typecheck 9 ✓ ·
    test 55/12 files ✓ · lint 6 ✓; `node apps/web/scripts/capture-geometry.mjs` extracts 2 items + writes both goldens. Files:
    `apps/web/src/reader/page-geometry.ts` (+test), `pdf-page.tsx` (onTextGeometry seam), `scripts/capture-geometry.mjs`,
    `test-fixtures/{sample.pdf,raw-textcontent.json,expected-geometry.json}`, `src/tests/pdf-page-geometry.test.tsx`.
    Implementation note: type-only pdf.js import uses deep path `pdfjs-dist/types/src/display/api` (top-level doesn't re-export
    `TextContent`/`TextItem`). 3 advisory review findings (non-blocking): (1) `onTextGeometry` in render-effect deps — unit-10
    consumer must pass a stable callback identity or the canvas+TextLayer re-renders; (2) `capture-geometry.mjs` inlines the
    core normalizer (Node can't resolve workspace `.ts` exports) — drift caught at test time; (3) spot-checks hardcode font
    metrics (intentional, keeps them independent of the golden).
  - **05c-3 SPECCED (2026-06-10) — Issue #50, Closes #50, branch feat/50-mobile-text-geometry, spec specs/05c-mobile-text-geometry.md.**
    Route **standard** (single boundary apps/mobile; no new dep — pdfjs-dist/react-native-webview from 05b + @ember/core already
    deps; not a UI unit). Final 05c slice: the mobile WebView extracts per-item text geometry and RN reproduces the committed web
    golden BYTE-FOR-BYTE through the SAME @ember/core normalizer = the unit-10 highlight-anchor parity payoff.
    **Design RESOLVED (parity by construction):** (1) WebView PROJECTS (posts raw {pageNumber,viewport(scale-1),items} — the SAME
    shape 05c-2's raw-textcontent.json captured), RN NORMALIZES via real @ember/core normalizePageText → headlessly testable + same
    function as web; (2) bridge message shape == web golden shape by design, so the parity test feeds the COMMITTED
    apps/web/test-fixtures/raw-textcontent.json → asserts expected-geometry.json (single source of truth, no copy, no device);
    (3) surface via optional onTextGeometry on ReaderWebView (no consumer — unit-10 seam; ReaderScreen untouched), fired per page
    from the existing getTextContent() path. Device-bound: extraction runs in the WebView → throwaway app/dev/ screen loads the
    committed sample.pdf, extracts on-device, diffs expected-geometry.json → PASS, then DELETED in this PR (03c/04c convention).
    **05c-3 MERGED (2026-06-10) — PR #51 squash-merged to main, #50 closed, branch deleted, main synced (CI verify ✓ 59s).
    Completes the 05c chain (05c-1 core shape → 05c-2 web golden → 05c-3 mobile parity).** TDD executor (Sonnet) →
    fresh-context Opus review = **APPROVE-WITH-NITS**,
    NO blockers (confirmed parity test genuine/not self-fulfilling, adapter pure, scale-1 viewport, core/store/web/ReaderScreen
    byte-untouched; re-ran all gates). Permanent surface: `src/reader/page-geometry.ts` (`geometryFromBridge` — drops
    TextMarkedContent, projects, calls core `normalizePageText`; the byte-for-byte golden parity test reads apps/web's committed
    `raw-textcontent.json`→`expected-geometry.json`), `build-reader-html.ts` (posts `{type:'geometry',pageNumber,viewport(scale-1),
    items}` per page from the existing getTextContent path), `reader-webview.tsx` (geometry msg → optional `onTextGeometry`).
    typecheck 9 ✓ · test 38 mobile (34+4) / web 55 / core 45 / store 69 / tokens 23 ✓ · lint 6 ✓ · `expo export -p android` →
    Exported: dist ✓. **DEVICE-VERIFIED (user, Expo Go): dev screen showed PASS — page-1 geometry item count 2, first box
    x=0.0840 y=0.0594 w=0.0863 h=0.0143 == the committed web golden, byte-for-byte on a real device** (the unit-10 parity payoff).
    - **3 device-only harness bugs found+fixed during the user's pass (harness-only — permanent surface untouched; carry-forwards):**
      1. **`readAsStringAsync` from the NEW `expo-file-system` API throws (deprecated).** Use `expo-file-system/legacy` (the 04c rule);
         to read a BUNDLED asset, legacy `downloadAsync(resolveAssetSource(uri), dest)` → `readAsStringAsync(dest,{encoding:'base64'})`
         → `base64ToBytes` (Metro asset URI is http:// in dev, so stage to scoped cache first).
      2. **The WebView reader renders LAZILY via IntersectionObserver in scroll mode** — a hidden/1px WebView never renders page 1,
         so the geometry post (inside `renderPage`) never fires. A headless geometry harness must size the WebView visibly AND use
         **paged mode** (renders page 1 immediately on load, not gated on intersection).
      3. **The dev index needs a reachable link** — `app/index.tsx` (home) had no `/dev` link after 03c/04c harnesses were deleted;
         a `__DEV__` link from home is required to reach `app/dev/`.
    - Throwaway dev harness (`app/dev/` + the home `__DEV__` link + the copied `assets/sample-golden.pdf`) DELETED post-PASS in the
      same PR (03c/04c convention); only the permanent surface remains. One review nit left as-is (matches web's adapter): the
      `transform` type guard checks presence not `Array.isArray` — theoretical only (real pdf.js always sends a length-6 array).
- **Unit 04c (#40) build context (historical — already MERGED, see above):**
  Spec: specs/04c-mobile-import-library-list.md, route **standard**. Binds 04a ports to native: `BlobStore`→
  expo-file-system, `Hasher`→expo-crypto, `Repository`→existing SqliteRepository/expoSqliteDriver (03c),
  + kv-store-persisted HLC clock; bespoke uniwind Library screen (expo-document-picker PDF import, dedupe,
  recently-added-first, theme control). New deps: expo-file-system/expo-crypto/expo-document-picker (via
  `expo install`) + `sonner-native@0.26.1` (toast feedback) which pulls `react-native-svg` (peer); +allowBuilds
  for any with a build script. Independent of 04d (shadcn is web-only). Throwaway device-verify screen per
  ai-workflow-rules. Decisions (this session): document-picker (no drag-drop on mobile); new expo-file-system
  OO API; clock persists via expo-sqlite/kv-store (settled); Library replaces the home-screen placeholder;
  **sonner-native toasts (not an inline banner)** themed from useTheme — mirrors 04d's web Sonner retrofit.
  native-clock/format-bytes mirror web's (dedup hoist deferred — don't widen web).
  **STATUS: BUILT (Sonnet, TDD: mobile 20 tests) → impeccable polish (token-resolved spinner tint killed
  a hardcoded `#E0701B`; branded react-native-svg ember flame replacing the emoji, matching web; de-duped
  card/empty-state copy + em-dash; pressed CTA state) → fresh-context review (Opus) = APPROVE-WITH-NITS.
  Fixes applied: mixed-batch toast now tallies added vs deduped (was last-file-only); corrected the dev
  harness SHA-256("abc") vector (was wrong → device check would've always failed); tightened the dedupe
  test to assert `repo.unacked()` length directly (invariant #2). Gates: typecheck 9 ✓ · test 25 mobile ✓ ·
  lint 6 ✓ · `expo export -p android` → Exported: dist ✓. Deps installed: expo-file-system ~56.0.7,
  expo-crypto ~56.0.4, expo-document-picker ~56.0.4, react-native-svg 15.15.4, sonner-native 0.26.1
  (+react-native-svg/sonner-native in allowBuilds).
- **3 device-only bugs surfaced during the user's device pass — none catchable by typecheck/test/bundle;
  CARRY-FORWARD for future mobile units:**
  1. **expo-sqlite/kv-store via `require` needs the default instance.** `getItemSync`/`setItemSync` are
     methods on the *default export* (`export default AsyncStorage`; alias `Storage`), NOT top-level named
     exports — so `require('expo-sqlite/kv-store').getItemSync` is undefined. Reach `.default`/`.Storage`
     (native-clock.ts). (Static `import Storage from '…'` like the theme provider also works.)
  2. **uniwind `className` is a no-op on third-party components** (e.g. `SafeAreaView` from
     react-native-safe-area-context) — it only styles RN core / `withUniwind`-wrapped comps (02d rule).
     Put `bg-surface`/padding on a core `View`; use SafeAreaView only for insets via `style`.
  3. **Reading a document-picker pick on Android/Expo Go:** new `File.bytes()` rejects SAF `content://`
     ("Missing READ permission"); `copyToCacheDirectory:true` lands in `cache/DocumentPicker/` which is
     outside Expo Go's readable scope ("isn't readable"). Working pattern (pick-pdf.ts): pick with
     `copyToCacheDirectory:false` → legacy `copyAsync` (ContentResolver) into scoped `cacheDirectory` →
     `readAsStringAsync` base64 → decode via the pure unit-tested `base64.ts`. Works in Expo Go + standalone.
  **Process carry-forward (user): pick mobile/Expo APIs from the OFFICIAL docs, not type stubs/memory —
  runtime constraints (SAF scoping, Expo Go sandbox) don't show in any local gate. See memory.**
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
- ~~**Mobile text-layer extraction** (unit 05)~~ **RESOLVED 2026-06-09 (user) + confirmed 05b build:**
  Engine is **pdf.js inside a react-native-webview** (render AND text layer, same pdfjs-dist@6.0.227 as web).
  One engine → exact 05a parity; selectable text layer ships in 05b; geometry extraction to RN core is 05c.
  architecture.md updated: mobile PDF row changed from react-native-pdf to pdfjs-dist-in-WebView.
- ~~**Convex auth provider** (unit 11): which sign-in method(s) — email link, OAuth (Google/Apple)?~~
  **RESOLVED 2026-06-15 (user):** provider = Convex Auth (`@convex-dev/auth`); claim credential = **Password**
  (email+password). OAuth (Google/Apple) and email-link/OTP **deferred** (need provider config / an email
  provider) — not in 11a/11b/11c. Shipped web (11b) + mobile (11c) on Password.
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
