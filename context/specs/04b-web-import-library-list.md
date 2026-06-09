# Unit 04b: Web import + Library list (apps/web)

Issue: #36 (part of umbrella #4) · Branch: feat/36-web-import-library-list · Boundary: apps/web
Route: standard (UI unit) — single boundary (apps/web), several files, no new external dep; binds the
04a ports to browser APIs and wires `importDocument`/`listDocuments` to a real Library UI. Ambiguity
resolved (HLC wiring / import UX / row behaviour confirmed with user 2026-06-09). UI unit →
frontend-design then impeccable before review.

Second slice of Unit 04: **04a** shared brain (#34, MERGED) → **04b** web import + Library list (this)
→ **04c** mobile import + Library list (device-bound). All domain logic lives in 04a; 04b only adds the
web *platform bindings* + UI glue. No reader yet (unit 05) — rows are display-only.

## Goal
Let a user add PDFs to their library on the web client and see them listed. Bind `BlobStore`→OPFS,
`Hasher`→SubtleCrypto, `Repository`→the existing `DexieRepository`, plus a minimal persisted HLC clock
+ device id so each new import is written through the outbox exactly once (invariant #2). The Library
screen imports via drag-drop **and** a file picker (PDF-only, dedupe-by-content-hash) and renders a flat,
recently-added-first list with a warm empty state. Re-importing identical bytes adds no second row.

## Design   (UI unit — frontend-design generates, impeccable polishes, before code-review)
Warm "reading nook" Library, all from `ui-context.md` tokens (no hardcoded colors/spacing — invariant #6).
- **Shell:** themed `bg-surface`/`text-text` page with a slim header carrying the *Ember* wordmark
  (Fraunces) and the existing theme segmented control (move it into the header; keep its a11y pattern).
  This is the Library screen only — full Today/Library/Stats tab nav is a later unit, do not build it.
- **Import dropzone:** a generous card on `surface-raised` with a dashed `line` border and an "Add PDF"
  button (primary, accent). On drag-over, lift the border/bg toward `accent` (the "ember" warming).
  Copy is gentle and literary, second person. Hidden `<input type="file" accept="application/pdf" multiple>`.
- **Document list:** rows/cards on `surface-raised` separated by `line` hairlines — title in Fraunces,
  filename · size · imported-date in Inter `text-muted`. Display-only (no click target, no dead "Open").
- **Empty state:** an ember-motif prompt, warm not nagging (e.g. "Your library's waiting for its first
  spark — drop a PDF to begin."). Exact copy is impeccable's call within this voice.
- **Rejected / dedupe feedback:** quiet inline notice (non-PDF rejected gently; identical file →
  "already in your library"), never an alarming error. Auto-dismiss or dismissible.

## Implementation
All new web files under `apps/web/src/`. Platform bindings live here (OPFS/SubtleCrypto are web-only),
mirroring how `expoSqliteDriver` lived in apps/mobile for 03c. Add `@ember/store: workspace:*` to
`apps/web/package.json` deps.

### `src/store/opfs-blob-store.ts` — `OpfsBlobStore implements BlobStore`
- Backed by OPFS: lazily `await navigator.storage.getDirectory()` then a `blobs` subdir
  (`getDirectoryHandle('blobs', { create: true })`); cache the dir handle promise.
- `put(id,bytes)`: `getFileHandle(id,{create:true})` → `createWritable()` → `write(bytes)` → `close()`
  (overwrites). `get(id)`: `getFileHandle(id)` → `getFile()` → `new Uint8Array(await file.arrayBuffer())`;
  return `undefined` on `NotFoundError`. `has(id)`: try `getFileHandle(id)` → true; `NotFoundError` →
  false. `delete(id)`: `removeEntry(id)` swallowing `NotFoundError`. `close()`: no-op, idempotent.
- Value isolation is inherent (OPFS copies bytes through the file); document that in TSDoc.
- **Not unit-testable under jsdom** (no OPFS) — exercised by the browser-verify step below, not vitest.

### `src/store/subtle-crypto-hasher.ts` — `subtleCryptoHasher: Hasher`
- `sha256Hex(bytes)`: `crypto.subtle.digest('SHA-256', bytes)` → map the `ArrayBuffer` to lowercase hex.
  Export a const object implementing `Hasher` (no platform state). Vitest's Node `globalThis.crypto.subtle`
  satisfies this, so it IS unit-tested against known vectors.

### `src/store/web-clock.ts` — persisted HLC + device identity (the confirmed "minimal persisted clock")
- `createWebClock(deps?: { storage?: StorageLike; now?: () => number; newId?: () => string })` factory
  (defaults: `localStorage`, `Date.now`, `crypto.randomUUID`) — deps injectable so it is pure-testable.
- Device id: read `ember-device-id` from storage; if absent, `newId()` and persist. Stable across reloads.
- Clock: on init, load `ember-hlc` (encoded) via `parse()`; else `initialClock(deviceId)`.
  `nextStamp(): Hlc` → `clock = tick(clock, now())`, persist `encode(clock)`, return the new `Hlc`.
  Monotonic across reloads (counter restored). Also expose `deviceId` and `newOutboxId = () => newId()`.
- `StorageLike = Pick<Storage, 'getItem' | 'setItem'>`.

### `src/store/web-store.ts` — compose the deps + import/list surface
- `createWebStore(deps: { repo: Repository; blobs: BlobStore; hasher: Hasher; clock: WebClock }): WebStore`
  where `WebStore = { importPdf(file: File): Promise<ImportResult>; listDocuments(): Promise<Document[]> }`.
  - `importPdf`: read `await file.arrayBuffer()` → `new Uint8Array`; call `@ember/store` `importDocument`
    with `{ repo, blobs, hasher, newOutboxId: clock.newOutboxId, hlc: clock.nextStamp(), now: clock.now() }`
    and `{ bytes, filename: file.name, contentType: 'application/pdf' }`. Return the `ImportResult`.
  - `listDocuments`: `listDocuments(repo)` sorted `importedAt` desc (recently-added-first — UI concern).
  - **Deps are injected**, so tests pass `MemoryRepository` + `MemoryBlobStore` + `subtleCryptoHasher` +
    a `createWebClock` over an in-memory storage. Production builds the real `DexieRepository('ember')` +
    `OpfsBlobStore` + `createWebClock()`.
- `src/store/store-context.tsx`: `StoreProvider` (builds the production `WebStore` once via `useMemo`/lazy
  init; accepts an optional `store` prop so tests inject a memory-backed one) + `useWebStore()` hook.
  Follows the existing `theme-provider.tsx`/`use-theme.ts` shape.

### `src/library/` — the screen
- `use-library.ts`: hook over `useWebStore()` — holds `documents: Document[]`, `loading`, last `notice`
  ({ kind: 'rejected' | 'deduped' | 'added'; message } | null); `refresh()` (load list on mount);
  `importFiles(files: File[])`: validate each is PDF (`type === 'application/pdf'` or name ends `.pdf`) —
  reject non-PDF with a notice; import the rest; set a `deduped`/`added` notice from `ImportResult`;
  refresh the list. Sequential awaits are fine (local writes).
- `import-dropzone.tsx`: drag-drop target (dragenter/over/leave/drop with `preventDefault`, drag-over
  visual state) + "Add PDF" button triggering the hidden multiple PDF file input; calls `onFiles`.
- `document-row.tsx`: presents one `Document` — title (Fraunces), `filename · formatBytes(byteSize) ·
  formatted importedAt` (Inter, muted). No interactive affordance.
- `format-bytes.ts`: pure `formatBytes(n: number): string` (B/KB/MB) — unit-tested.
- `library-page.tsx`: composes header (wordmark + theme control), dropzone, notice, list/empty-state.

### `src/App.tsx` (replace placeholder) + `src/main.tsx`
- `main.tsx`: wrap the tree in `StoreProvider` (inside the existing `ThemeProvider`).
- `App.tsx`: render `<LibraryPage />`. Preserve the theme segmented control (relocated into the Library
  header) — don't regress the 02b a11y/focus pattern.

### Tests (`apps/web/src/tests/`, jsdom + RTL + vitest — match existing setup)
- `format-bytes.test.ts`: B/KB/MB boundaries, zero.
- `web-clock.test.ts`: injected in-memory storage + fake `now`/`newId` — stamps strictly increase
  (counter bumps within same ms, wall advances across ms); device id persisted & stable; a *second*
  `createWebClock` over the same storage resumes the persisted clock (monotonic across "reload").
- `subtle-crypto-hasher.test.ts`: known SHA-256 vectors (empty input; `"abc"`).
- `library-page.test.tsx`: render `<LibraryPage />` inside `StoreProvider` with an **injected** memory
  store. Empty state shows first; importing a fake PDF `File` (`new File([bytes], 'a.pdf', {type:
  'application/pdf'})`) adds exactly one row with derived title; importing the *same bytes* again adds no
  second row and surfaces a dedupe notice; a non-PDF `File` is rejected with a notice and adds no row.
- Do NOT unit-test `OpfsBlobStore` (no OPFS in jsdom) — it is browser-verified below.

## Dependencies
- No new external dependency. Uses browser-native OPFS, `crypto.subtle`, `crypto.randomUUID`, and the
  existing workspace packages. Add `@ember/store: workspace:*` to `apps/web/package.json` (workspace dep,
  not a registry install). `Dexie` is already a dep of `packages/store`. zod still deferred — PDF
  validation here is a simple type/extension check, not schema parsing.

## Verify when done
- [ ] Drag-drop **and** the "Add PDF" picker each import a PDF; a new `Document` row appears (title
      derived from filename); a non-PDF is rejected with a gentle notice and no row.
- [ ] Re-importing identical bytes adds no second row and shows a dedupe notice (one record, one outbox
      entry — invariant #2 not re-fired).
- [ ] List is recently-added-first; empty state shows when the library is empty.
- [ ] `subtleCryptoHasher.sha256Hex` matches known SHA-256 vectors; `web-clock` stamps are monotonic and
      survive a simulated reload; injected memory-store Library tests pass.
- [ ] UI uses only `@ember/tokens` tokens (no hardcoded colors/spacing — invariant #6); theme control
      still themes light/dark with the 02b focus/a11y pattern intact.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (fully works offline; Convex never on the read
      path — imports land in OPFS+Dexie only), #2 (the new import is written through the outbox with an
      HLC stamp), #6 (tokens). core/store gained no platform import.
- [ ] **BROWSER-VERIFIED (real Chromium, not jsdom):** `pnpm --filter @ember/web dev` → drop a PDF →
      row appears → **full page reload** → row persists (real OPFS blob + Dexie record + outbox entry on
      disk); re-drop the same file → no duplicate. OPFS requires a secure context (localhost is fine).
```
