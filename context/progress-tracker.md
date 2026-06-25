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
