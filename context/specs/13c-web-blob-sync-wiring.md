# Unit 13c: Web blob-sync wiring — CryptoBox + BlobTransport + eager scheduler + over-limit UX + quota meter

Issue: #115 (umbrella #13) · Branch: feat/115-web-blob-sync-wiring · Boundary: `apps/web`
Route: standard — one boundary (`apps/web`), no new dep (Web Crypto + `fetch` are platform
built-ins; the convex client already exists), all product forks resolved at the umbrella level.
**UI unit** → the net-new quota meter + sync badges go through `frontend-design` then `impeccable`
before `code-review`.

Third slice of umbrella **#13** (File storage sync + quota): **13a** Convex file-storage server
(MERGED, #112) → **13b** core blob-sync engine + ports (MERGED, #114) → **13c** web upload/download
wiring + over-limit UX + quota meter (this) → **13d** mobile wiring (device-bound).

## Goal
Wire 13b's pure `blob-sync` engine to the live 13a server **inside the web app**, so a synced PDF's
bytes travel cross-device: each device **encrypts + uploads** its locally-imported blobs and **eagerly
downloads** the blobs of synced documents it doesn't have yet — all in the background, with Convex off
the read path (invariant #1). When the server rejects an upload for being over the per-file cap or
over the user's quota, the file **stays fully local and readable** and is surfaced as "kept on this
device / not synced" with a manual retry; a **quota meter** shows usage against the 1 GB limit.

This is the web mirror of 12c's reconciler wiring, re-expressed for blobs: it builds the real
`CryptoBox` and `BlobTransport` bindings (the two ports 13b left abstract), schedules `reconcileBlobs`,
and reads the local `blob-sync` status records to drive the UI. **No core/store/convex change.**

## Resolved forks (umbrella #13, 2026-06-26) — inherited, do not re-litigate
- **Client-side symmetric encryption (non-ZK), AES-256-GCM.** Per-user key escrowed by 13a
  (`getOrCreateBlobKey`); the binding imports it once/session into the `CryptoBox`.
- **Eager background download** after sync; **over-limit ⇒ keep local, skip upload, retry later**;
  **50 MB/file · 1 GB/user**, server-authoritative.

## Design decisions (this slice — implementation shape, not product forks)
- **Decoupled blob-sync hook** (`use-blob-sync`), separate from `use-reconciler`, sharing the same
  triggers (auth-ready, interval, import signal, online/focus). A freshly-pulled doc record becomes a
  download candidate on the next blob-sync tick — eager-enough background download with bounded lag
  (≤ interval). *Rejected:* chaining blob-sync inside `reconcile()` (couples record-sync and
  blob-sync concerns into one hook; harder to test independently).
- **`candidateIds` = all locally-known doc ids** (`store.listDocuments()` → `id`). On web every listed
  document is a synced record (everything flows outbox→push→pull), so this one list is correct for
  **both** sides: upload (ids whose bytes are local & not yet synced) and download (ids whose bytes are
  not local yet). 13b's planner partitions it.
- **Auto loop uses `retryDeferred: false`.** Re-attempting a known over-*file-cap* upload every cycle
  can never succeed (the file is simply too big) — hammering the server is pointless. Deferred blobs
  surface a **manual "Try again"** affordance that runs a one-shot `reconcileBlobs({ retryDeferred:true })`
  (meaningful for over-*quota* once the user frees space elsewhere / on another device).
- **`storageId` + upload/download URLs never leave the binding** (13a/13b contract): `upload` does
  `generateUploadUrl` → POST → returns the storageId from the POST response; `download` does
  `getDownloadUrl` → `fetch` → bytes. Core only ever sees `contentId` ⇄ bytes.
- **Status read for the UI uses the existing `Repository.query`** over `BLOB_SYNC_COLLECTION` — no
  store-package change (13b already established `BlobStatusStore` is satisfied structurally by
  `Repository`). The `blob-sync` records are written via `repo.put`/`delete` (which `withMutationNotify`
  passes straight through — **no notify, no enqueue**), so invariant #2 holds.

## Implementation — all under `apps/web/src`

### 1. CryptoBox binding — `store/web-crypto-box.ts` (new)
- `createWebCryptoBox(rawKey: Uint8Array | CryptoKey): CryptoBox` — AES-256-GCM via `crypto.subtle`.
  - `encrypt(plaintext)`: fresh random 12-byte IV (`crypto.getRandomValues`) → `subtle.encrypt` →
    return `IV ‖ ciphertext` (IV prepended) as one `Uint8Array`.
  - `decrypt(blob)`: split first 12 bytes as IV, rest as ciphertext → `subtle.decrypt` → plaintext.
  - Accept a raw key (import to a non-extractable `CryptoKey` once) or a pre-imported `CryptoKey`.
- `loadBlobKey(client): Promise<CryptoKey>` — calls `api.files.getOrCreateBlobKey`, base64-decodes the
  returned key string to 32 bytes, `subtle.importKey('raw', …, {name:'AES-GCM'}, false, ['encrypt','decrypt'])`.
  (Binding glue — the key cache lives in the hook, one import per session.)
- Unit-testable: `crypto.subtle` is available in the vitest/jsdom (Node) env — round-trip with a fixed
  raw key, IV uniqueness across calls, tamper ⇒ decrypt rejects.

### 2. BlobTransport binding — `sync/convex-blob-transport.ts` (new)
- `createConvexBlobTransport(client: ConvexReactClient): BlobTransport`:
  - `upload(ciphertext)`: `url = await client.mutation(api.files.generateUploadUrl)`; `POST` the
    ciphertext (`Content-Type: application/octet-stream`) via `fetch`; parse `{ storageId }` from the
    JSON response; return `{ storageId }`.
  - `saveBlob(contentId, storageId)`: `client.mutation(api.files.saveBlob, { contentId, storageId })`
    — pass the `SaveBlobResult` union straight through (13a returns it; never throws on a limit).
  - `download(contentId)`: `url = client.query(api.files.getDownloadUrl, { contentId })`; if `null`
    return `null`; else `fetch(url)` → `new Uint8Array(await res.arrayBuffer())`.
  - `deleteBlob(contentId)`: `client.mutation(api.files.deleteBlob, { contentId })`.
- Testable with a fake client (records mutation/query calls, returns canned values) + a mocked
  `fetch`/`global.fetch`.

### 3. Storage-usage hook — `sync/use-storage-usage.ts` (new)
- `useStorageUsage(): BlobLimits | undefined` — thin `useQuery(api.files.getStorageUsage)` wrapper
  (returns `{ used, quota, fileCap }`); `undefined` while loading / unauthenticated. (`BlobLimits`
  type comes from `@ember/core`.)

### 4. Sync bundle — extend `store/store-context.tsx`
- Add to `SyncBundle` what the blob-sync hook needs from the **same** instances already built:
  - `blobs: BlobBytes` — the existing `OpfsBlobStore` (already satisfies `has/get/put`).
  - `blobStatus: BlobStatusStore` — the **same** repo instance (satisfies `get/put/delete`
    structurally). (Reuse the repo; do not build a second store.)
- Keep `bundle === null` when a store is injected (tests skip production instantiation) — unchanged.

### 5. Blob-sync scheduler — `sync/use-blob-sync.ts` (new)
- Mirrors `use-reconciler` structure (overlap guard + trailing-coalesce + lazy transport import):
  - Gate: `isAuthenticated && bundle !== null`; tear down otherwise.
  - Lazily import the convex singleton (keeps the throwing module out of the test graph); build the
    `CryptoBox` (one `loadBlobKey` per session, cached in a ref) and `BlobTransport`. Injectable via
    opts (`{ transport?, crypto?, intervalMs? }`) so tests pass fakes and never load convex.
  - `run()`: skip if `!navigator.onLine`; derive `candidateIds = (await store.listDocuments()).map(d=>d.id)`;
    `await reconcileBlobs({ candidateIds, blobs, transport, crypto, status: blobStatus, retryDeferred:false })`.
  - Triggers: immediate on mount (auth-ready), `setInterval` (15 s), `window` `focus`/`online`, and the
    shared mutation `signal` (debounced) so a fresh import uploads promptly.
  - Fail-soft: swallow transport errors (13b already tallies `failed` per blob); never block render.
  - Expose a returned `retryDeferred()` callback (one-shot `reconcileBlobs({…, retryDeferred:true})`)
    for the deferred-row "Try again" action, and a way for the UI to refresh status after a run
    (e.g. bump a signal / return the last `BlobSyncReport`).
- `App.tsx` calls `useBlobSync()` next to `useReconciler()`.

### 6. Status read on the store — `store/web-store.ts`
- Add `listBlobStatuses(): Promise<BlobStatus[]>` → `repo.query<BlobStatus>(BLOB_SYNC_COLLECTION)`.
  (`BLOB_SYNC_COLLECTION` + `BlobStatus` from `@ember/core`.) Read-only; no enqueue. This is the one
  small `WebStore` surface addition — still apps/web, no store-package change.

### 7. UI — Library page (net-new visuals → frontend-design + impeccable)
- **Quota meter** `library/storage-meter.tsx` (new): reads `useStorageUsage()`; renders a labelled
  progress bar — e.g. "312 MB of 1 GB used" — with a calm near-limit treatment (warm amber as it
  approaches full). Token-only (invariant #6); `role`/`aria-valuenow`/`aria-valuemax` for a11y;
  hidden/placeholder while `undefined`. Placed at the top of `LibraryPage` (under the title / near the
  dropzone). Skips render gracefully when unauthenticated (no convex).
- **Per-row sync badge**: `use-library` joins each `Document` with its `BlobStatus`
  (`listBlobStatuses()` keyed by id) → a derived `syncState`:
  - `synced` → subtle "Synced" affordance (or no badge — design choice).
  - `deferred` (`over-file-cap`) → "Too large to sync — kept on this device".
  - `deferred` (`over-quota`) → "Storage full — kept on this device" + **"Try again"** action
    (calls the hook's `retryDeferred()`).
  - no status yet → "Syncing…"/pending (quiet) — it will resolve on the next tick.
  DocumentRow gains an optional `syncState` prop + the badge; copy stays warm and reassuring
  ("kept on this device", never alarming — the file is fully usable).
- Optional (nice-to-have, not a blocker): a `toast` when a blob is **newly** deferred during a run,
  derived from the `BlobSyncReport`. Keep quiet/aggregate, not one-per-file.

### Barrel / wiring notes
- No `@ember/*` package edits. `BlobLimits`, `BlobStatus`, `BLOB_SYNC_COLLECTION`, `CryptoBox`,
  `BlobTransport`, `BlobBytes`, `BlobStatusStore`, `reconcileBlobs` are already exported from
  `@ember/core` (13b). `api.files.*` is already on `@ember/convex/_generated/api` (13a).

## Invariants
- **#1** storage off the read path: bytes only move in/out of the **local** `OpfsBlobStore`; the reader
  still reads local bytes; download is eager background (client-scheduled). ✓
- **#2** blob metadata is a **direct authed transport call**, never an outbox mutation; the engine never
  enqueues. The `blob-sync` status records are written via `repo.put`/`delete` (no notify, no enqueue)
  and are **local-only / never pushed** — same discipline as 12c's cursor. The document *record* still
  syncs via 12 unchanged. ✓
- **#5** content-addressed by `contentId` ⇒ zero merge logic in this slice. ✓
- **#6** token-only UI (quota meter + badges); shadcn where it fits, handroll the gaps. ✓
- **core purity:** all platform code (Web Crypto, fetch, convex) lives in `apps/web`; `@ember/core`
  untouched. ✓

## Dependencies
- **None new.** Web Crypto (`crypto.subtle`), `fetch`, and the existing `convex` client cover it.
  Tests use fakes: a fake `BlobTransport` (canned `SaveBlobResult`s + a Map server), an identity/real
  `CryptoBox`, `MemoryRepository` + `MemoryBlobStore` (or a Map) — no real convex/OPFS in jsdom.

## Verify when done
- [ ] `web-crypto-box`: `decrypt(encrypt(x)) === x` (bytes preserved) with a fixed raw key; two
      `encrypt` calls of the same plaintext differ (fresh IV); a tampered blob ⇒ `decrypt` rejects.
- [ ] `convex-blob-transport`: `upload` calls `generateUploadUrl` then POSTs the ciphertext and returns
      the storageId; `saveBlob` passes the union through unchanged (ok + each reject code);
      `download` returns `null` when `getDownloadUrl` is null, else fetches → bytes; `deleteBlob` calls
      the mutation. (fake client + mocked fetch.)
- [ ] `use-blob-sync`: gated on auth+bundle (no run otherwise); runs on mount, interval, import signal,
      online/focus; **offline ⇒ skip**, online re-triggers; overlap coalesces to one trailing run;
      transport error swallowed (no throw to render); e2e on fakes uploads pending + downloads missing +
      records `synced`/`deferred`; `retryDeferred()` includes previously-deferred ids.
- [ ] `use-library` join: a doc with a `deferred`/`over-quota` status shows the "Storage full" badge +
      Try-again; `over-file-cap` shows "Too large"; `synced` shows the synced/none state; missing status
      shows pending. (fake store returning canned `listBlobStatuses`.)
- [ ] `storage-meter`: renders `used`/`quota` with correct aria; near-limit treatment; hidden while
      `undefined`.
- [ ] No `@ember/core` / `@ember/store` / `convex/` package change (apps/web only); no new dep.
- [ ] `pnpm -w typecheck` · `pnpm -w test` (new web cases) · `pnpm -w lint` all pass.
- [ ] No invariant violated — esp. **#1** (local-only byte movement; reader still local), **#2** (no
      enqueue; status records local-only / never pushed), **#5** (zero merge logic).

## Dispatch
Sonnet TDD executor (build bindings + hook test-first; then UI) → **frontend-design** for the net-new
quota meter + sync badges → **impeccable** pass (UX/visual/a11y, warm reassuring copy) → fresh-context
**Opus reviewer** (verify #1/#2/#5 + core purity + no `@ember/*`/convex package change + storageId/URLs
never leave the binding + status records never enqueued) → branch `feat/115-web-blob-sync-wiring` /
commit / PR "Closes #115".

## Browser-verify (USER, before merge) — like 04b / 12c
`pnpm --filter @ember/web dev` against the dev deployment (necessary-warbler-246), two browser
profiles (or two devices) signed into the **same** account:
1. Profile A: import a small PDF → row shows "Syncing…" then settles (synced). Quota meter ticks up.
2. Profile B (same account): after a sync cycle the document row appears and its bytes **eagerly
   download** in the background → open it → it reads from local OPFS (no spinner on the read path).
3. Import a **> 50 MB** PDF in A → it imports + opens locally, row shows **"Too large to sync — kept on
   this device"**; quota meter does **not** include it; B never receives it.
4. (Quota) optional: confirm the meter reflects `getStorageUsage`; a deferred over-quota row offers
   **Try again**.

## Deploy gate
**None** — `apps/web` client wiring against the already-deployed 13a server. (User browser-verify above
is a runtime check, not a schema/deploy push.)
