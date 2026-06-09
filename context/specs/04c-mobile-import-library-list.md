# Unit 04c: Mobile import + Library list (apps/mobile)

Issue: #40 (part of umbrella #4) · Branch: feat/40-mobile-import-library-list · Boundary: apps/mobile
Route: standard — single boundary (apps/mobile); binds the 04a ports to native APIs and mirrors the
already-shipped 04b web unit. The only elevated signal is new deps (expo-file-system / expo-crypto /
expo-document-picker) — but they are first-party Expo modules installed via `expo install` (low new
surface), product behaviour is fully defined by 04b, and clock-persistence is a settled decision
(kv-store). UI unit → impeccable polish before review (frontend-design is web-only; for this RN screen
follow ui-context.md + mirror the 04b Library design — see Design).

Third slice of Unit 04: **04a** shared brain (#34, MERGED) → **04b** web import + Library list (#36,
MERGED) → **04c** mobile import + Library list (this, device-bound). All domain logic lives in 04a;
04c only adds the **mobile platform bindings** + a bespoke uniwind Library screen. No reader yet
(unit 05) — rows are display-only. Independent of 04d (shadcn is web-only; mobile stays bespoke uniwind).

## Goal
Let a user add PDFs to their library on the mobile client and see them listed. Bind `BlobStore`→
expo-file-system, `Hasher`→expo-crypto, `Repository`→the existing `SqliteRepository` over the existing
`expoSqliteDriver`, plus a minimal kv-store-persisted HLC clock + device id so each new import is written
through the outbox exactly once (invariant #2). The Library screen picks PDFs via a document picker
(PDF-only, dedupe-by-content-hash, multiple), renders a flat recently-added-first list with a warm empty
state, and keeps the theme control. Re-importing identical bytes adds no second row.

## Design   (UI unit — bespoke uniwind; impeccable polishes before code-review)
Same warm "reading nook" Library as 04b, translated to React Native + uniwind, all from `ui-context.md`
tokens (no hardcoded colors/spacing — invariant #6). Mobile is bespoke (no shadcn/Sonner). Mirror 04b's
voice and structure; do not introduce a tab bar (Today/Library/Stats nav is a later unit).
- **Screen = the home screen** (`app/index.tsx`): replace the placeholder body with the Library. Keep a
  slim header carrying the *Ember* wordmark (`font-serif`) and the existing segmented theme control
  (System/Light/Dark) — reuse the exact a11y/radiogroup pattern already in `app/index.tsx`, just relocated
  into the header. `bg-surface`/`text-text` page inside a `SafeAreaView`.
- **Import affordance:** a generous card on `surface-raised` with a dashed `border-line` and an "Add PDF"
  primary button (accent bg, `text-on-accent` ink — NOT white; the 04d a11y fix). Tapping opens the
  document picker. Copy gentle, literary, second person. No drag-drop (not a mobile interaction).
- **Document list:** rows on `surface-raised` separated by `border-line` hairlines — title in `font-serif`,
  `filename · formatBytes(byteSize) · imported-date` in `font-sans text-text-muted`. Display-only (no
  press target, no dead "Open").
- **Empty state:** an ember-motif prompt, warm not nagging (same voice as 04b). Exact copy is impeccable's
  call within this voice.
- **Rejected / dedupe / added feedback:** **`sonner-native` toasts** (the RN port of Sonner —
  github.com/gunnartorfis/sonner-native), mirroring 04d's web Sonner retrofit: `toast.success` (added),
  `toast` (already in your library), `toast.error` (non-PDF rejected) — warm, literary, second-person
  voice; never an alarming error. A single `<Toaster />` is mounted once in `app/_layout.tsx`, themed from
  our own `useTheme().resolvedTheme` (NOT a 3rd-party theme provider — same approach as web 04d). No inline
  banner.
- **Loading:** while the async store initializes (SQLite open + DDL) and while the list loads, show a calm
  themed loading state (`role` / `accessibilityState` busy), not a blank flash.

## Implementation
All new mobile files under `apps/mobile/src/` and `apps/mobile/app/`. Native bindings live here, mirroring
how `expoSqliteDriver` already lives in `apps/mobile/src/store/`. RN relative imports keep the explicit
`.js` extension (Metro resolver handles it — 02d carry-forward).

> The exact method names of the **new** expo-file-system OO API (`File`/`Directory`/`Paths`) and
> `expo-crypto`'s `digest` signature must be confirmed against the *installed* package's `.d.ts` after
> `expo install` — do not trust recalled names. The shapes below are the intended design; adjust call
> names to match the resolved SDK-56 versions.

### `src/store/expo-file-system-blob-store.ts` — `ExpoFileSystemBlobStore implements BlobStore`
- Content-addressed by document id under a `blobs/` directory in the app document directory
  (new API: `new Directory(Paths.document, 'blobs')`, created lazily with intermediates; cache the handle).
- `put(id, bytes)`: write `bytes` to `File(dir, id)` (create/overwrite). `get(id)`: return the file's
  bytes as a `Uint8Array`, or `undefined` if it doesn't exist. `has(id)`: file `.exists`. `delete(id)`:
  remove if present (swallow not-found). `close()`: no-op, idempotent.
- Value isolation is inherent (bytes round-trip through disk — write copies in, read returns a fresh
  array); document that in TSDoc. The ONLY file (besides the picker glue) importing `expo-file-system`.
- **Not headless-testable** (native module) — exercised by the device-verify screen below.

### `src/store/expo-crypto-hasher.ts` — `expoCryptoHasher: Hasher`
- `sha256Hex(bytes)`: `Crypto.digest(CryptoDigestAlgorithm.SHA256, bytes)` → map the returned
  `ArrayBuffer` to lowercase hex (reuse the same hex mapping shape as web's `subtleCryptoHasher`).
- Export a const object implementing `Hasher` (no platform state). The ONLY file importing `expo-crypto`.
- **Not headless-testable** (native module) — device-verified (the SHA-256 result is checked against a
  known vector on-device).

### `src/store/native-clock.ts` — kv-store-persisted HLC + device identity
- Mirrors `apps/web/src/store/web-clock.ts` but defaults storage to `expo-sqlite/kv-store` (the settled
  KV decision — see progress-tracker "Durable decisions"; the theme provider already uses its `*Sync` API).
- `createNativeClock(deps?: { storage?: StorageLike; now?: () => number; newId?: () => string })`
  (defaults: a kv-store-backed `StorageLike`, `Date.now`, `expo-crypto` `randomUUID` or `Crypto.randomUUID`).
  `StorageLike = { getItem(k): string | null; setItem(k, v): void }` (sync; kv-store exposes `getItemSync`/
  `setItemSync`).
- Device id: read `ember-device-id`; if absent, `newId()` and persist (stable across reloads).
- Clock: on init load `ember-hlc` (encoded) via `@ember/core` `parse()`, else `initialClock(deviceId)`.
  `nextStamp(): Hlc` → `clock = tick(clock, now())`, persist `encode(clock)`, return the new `Hlc`.
  Monotonic across reloads (counter restored). Expose `deviceId`, `now`, and `newOutboxId = () => newId()`.
- Deps injectable ⇒ **unit-testable** with an in-memory `StorageLike` + fake `now`/`newId` (no native dep).
- (Near-duplicate of `web-clock.ts`; a future micro-unit may hoist the shared HLC-clock logic into
  `@ember/store`. Out of 04c scope — do not widen into apps/web.)

### `src/store/format-bytes.ts` — pure `formatBytes(n: number): string` (B/KB/MB)
- Mirror `apps/web/src/store/format-bytes.ts`. Unit-tested. (Same dedup note as the clock — defer hoisting.)

### `src/store/native-store.ts` — compose deps + import/list surface
- `createNativeStore(deps: { repo: Repository; blobs: BlobStore; hasher: Hasher; clock: NativeClock }):
  NativeStore` where `NativeStore = { importPdf(bytes: Uint8Array, filename: string, contentType?: string):
  Promise<ImportResult>; listDocuments(): Promise<Document[]> }`.
  - `importPdf`: call `@ember/store` `importDocument` with `{ repo, blobs, hasher, newOutboxId:
    clock.newOutboxId, hlc: clock.nextStamp(), now: clock.now() }` and `{ bytes, filename,
    contentType: contentType ?? 'application/pdf' }`. Return the `ImportResult`.
  - `listDocuments`: `listDocuments(repo)` sorted `importedAt` desc (recently-added-first — UI concern).
  - **Takes already-read bytes** (the native uri→bytes read happens in the hook/picker glue, keeping this
    composition pure). Deps injected ⇒ **unit-testable** with `MemoryRepository` + `MemoryBlobStore` + a
    fake `Hasher` + `createNativeClock` over in-memory storage.

### `src/store/store-context.tsx` — `StoreProvider` + `useNativeStore`
- Async construction (unlike web's sync `useMemo`): build the production store in an effect —
  `SqliteRepository.create(await expoSqliteDriver())` + `ExpoFileSystemBlobStore` + `expoCryptoHasher` +
  `createNativeClock()` — and hold `{ store, ready }` in state; expose a `ready` flag so the screen shows
  the loading state until init completes. Accept an optional `store` prop so tests inject a memory-backed
  `NativeStore` synchronously (skip native construction when provided — mirrors web's injection escape
  hatch + 04b's jsdom-crash guard). Follows the existing `theme-provider.tsx`/`use-theme.ts` shape.

### `src/library/` — the screen + picker glue
- `pick-pdf.ts`: thin wrapper over `expo-document-picker` `getDocumentAsync({ type: 'application/pdf',
  multiple: true, copyToCacheDirectory: true })`; for each picked asset read its bytes via the new
  expo-file-system `File(uri).bytes()` and return `{ bytes, name, mimeType }[]`. The ONLY file (besides
  the blob store) importing expo-file-system, and the ONLY file importing expo-document-picker.
- `use-library.ts`: hook over `useNativeStore()` — holds `documents: Document[]`, `loading`; `refresh()`
  (load on ready); `pickAndImport()`: call `pickPdf()`, validate each is PDF (mimeType `application/pdf`
  or name ends `.pdf`) — reject non-PDF with `toast.error`; import the rest via `store.importPdf(bytes,
  name)`; fire `toast`/`toast.success` from each `ImportResult` (deduped vs added); refresh. Toasts are
  fire-and-forget (no notice state). Sequential awaits are fine (local writes).
- `import-card.tsx`: the dashed `surface-raised` card + accent "Add PDF" `Pressable` calling `onPickPdf`.
- `document-row.tsx`: one `Document` — title (`font-serif`), `filename · formatBytes · formatted importedAt`
  (`font-sans text-text-muted`). No interactive affordance.
- `library-screen.tsx`: composes header (wordmark + relocated theme control), import card, the
  `FlatList`/list + empty state + loading state. Exported and rendered by `app/index.tsx`. (Toaster is
  mounted at the root, not here.)

### `app/index.tsx` (replace placeholder body)
- Render `<LibraryScreen />`. Relocate the existing segmented theme control into the Library header,
  preserving its exact radiogroup a11y pattern (don't regress 02d). Wrap in `SafeAreaView`.

### `app/_layout.tsx`
- Wrap the existing `ThemeProvider` subtree with `<StoreProvider>` (StoreProvider inside ThemeProvider,
  mirroring web's `main.tsx`). Keep the `import '../global.css'` root import + `headerShown:false` (02d).
- Mount sonner-native's `<Toaster />` once here, themed from `useTheme().resolvedTheme` (`light`/`dark`).
  sonner-native renders via reanimated/worklets (already configured, 02d) and needs a
  `GestureHandlerRootView` ancestor — add one wrapping the tree if not already present (it isn't today).
  Per sonner-native docs, the `<Toaster />` is placed outside/above the navigator. Confirm placement
  against the installed version's README.

### Tests (`apps/mobile/src/tests/`, vitest — node env, pure logic only; mobile has no RN test renderer)
- `native-clock.test.ts`: injected in-memory `StorageLike` + fake `now`/`newId` — stamps strictly increase
  (counter bumps within same ms, wall advances across ms); device id persisted & stable; a *second*
  `createNativeClock` over the same storage resumes the persisted clock (monotonic across "reload").
- `format-bytes.test.ts`: B/KB/MB boundaries, zero.
- `native-store.test.ts`: `createNativeStore` over `MemoryRepository` + `MemoryBlobStore` + a fake
  `Hasher` (deterministic hex) + memory clock — importing bytes adds exactly one `Document`; importing the
  *same bytes* again returns a deduped `ImportResult` and adds no second record/outbox entry (invariant #2
  not re-fired); `listDocuments` is recently-added-first.
- Do NOT attempt RN component tests (no `@testing-library/react-native`/RN preset is set up — adding one
  is out of scope) and do NOT unit-test the expo-* bindings (native) — those are device-verified below.

### Device-bound verification (throwaway — ai-workflow-rules convention; recreate the harness)
03c's `app/dev/` + `src/dev/` were deleted on merge (throwaway). Recreate for 04c:
- `src/dev/verification-harness.tsx`: the shared harness (named async `Check`s; PASS returns a detail
  string, throw = FAIL; run-all + one-at-a-time for steps needing an app reload). Token-driven UI.
- `app/dev/index.tsx`: lists this unit's screen. `app/dev/import-04c.tsx`: the 04c checks (below).
- `__DEV__`-gated link to `/dev` on `app/index.tsx` (the Library header or a small dev affordance).
- **Delete `app/dev/`, `src/dev/`, and the `__DEV__` link in the same PR once all checks are green** (the
  real `src/store/*` bindings stay).

## Dependencies
Install via `expo install` (NOT bare npm — SDK 56 lags the registry; 02d carry-forward), then
`expo install --fix` to align, and add a `node:sqlite`-style **`allowBuilds`** entry in
`pnpm-workspace.yaml` for any of these that ships a build/postinstall script (else frozen CI install
fails — 04d carry-forward). Confirm the resolved versions are SDK-56 (`56.0.x`).
- `expo-file-system` (BlobStore + uri→bytes read) — registry latest 56.0.7 (let `expo install` pick).
- `expo-crypto` (SHA-256 Hasher + randomUUID) — registry latest 56.0.4.
- `expo-document-picker` (pick PDFs) — registry latest 56.0.4.
- `sonner-native@0.26.1` (toast feedback — RN port of Sonner, github.com/gunnartorfis/sonner-native). Plain
  npm dep (not Expo-managed), install via `pnpm --filter @ember/mobile add sonner-native@0.26.1`. Its peers
  are already satisfied EXCEPT **`react-native-svg`** (peer `^15.12.1`) — add it via `expo install
  react-native-svg` (SDK-56-managed native module; let Expo pick the version). Add an `allowBuilds` entry
  for either if it ships a build script.
- No other new dep. `@ember/core`/`@ember/store`/`@ember/tokens` already workspace deps; `expoSqliteDriver`
  + `SqliteRepository` already exist (03c). `expo-sqlite/kv-store` already used (theme provider). zod still
  deferred (validation here is a type/extension check).

## Verify when done
- [ ] Picking a PDF imports it; a new `Document` row appears (title derived from filename); a non-PDF is
      rejected with a gentle `toast.error` and no row.
- [ ] Re-importing identical bytes adds no second row and shows a dedupe toast (one record, one outbox
      entry — invariant #2 not re-fired); a new import shows a success toast.
- [ ] List is recently-added-first; empty state shows when the library is empty; loading state shows during
      async store init.
- [ ] `native-clock` stamps are monotonic and survive a simulated reload; `format-bytes` boundaries pass;
      injected memory-store `native-store` tests pass (add + dedupe + ordering).
- [ ] UI uses only `@ember/tokens` tokens (no hardcoded colors/spacing — invariant #6); theme control still
      themes light/dark with the 02d radiogroup a11y pattern intact; "Add PDF" uses `text-on-accent`
      (no white-on-amber).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (fully works offline; Convex never on the read
      path — imports land in on-device SQLite + the file system only), #2 (the new import is written through
      the outbox with an HLC stamp), #6 (tokens). `packages/core`/`packages/store` gained no platform import
      and stay byte-identical; expo-file-system/expo-crypto/expo-document-picker each imported in the
      narrowest possible set of files (per above); the `@ember/store` barrel still re-exports no native/test
      module (03c Metro carry-forward).
- [ ] Headless bundle sanity: `expo export -p android` → "Exported: dist" (03c carry-forward — catches
      barrel/native-import regressions without a simulator).
- [ ] **DEVICE-VERIFIED (real device/simulator, not vitest):** `npx expo start` in apps/mobile → `__DEV__`
      home link → **Unit 04c** dev screen → "Run all" green (expo-crypto SHA-256 matches a known vector;
      ExpoFileSystemBlobStore put→has→get round-trips bytes; document picker returns PDF bytes). Then in the
      real Library screen: pick a PDF → row appears with derived title → **fully reload the app** → row
      persists (real on-disk SQLite record + outbox entry + file-system blob); pick the same file again →
      dedupe toast, no second row; pick a non-PDF → gentle rejection toast. Toasts render and re-theme with
      light/dark. Then delete the dev route group + `__DEV__` link.
