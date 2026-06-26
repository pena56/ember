# Unit 13b: core blob-sync engine + CryptoBox port + cap/quota result types

Issue: #113 (umbrella #13) · Branch: feat/113-core-blob-sync-engine · Boundary: `packages/core`
Route: standard — one boundary (pure TS, no platform API), no new dep (crypto + transport are
injected ports; tests use in-memory fakes), all product forks resolved at the umbrella level.

Second slice of umbrella **#13** (File storage sync + quota): **13a** Convex file-storage server
(MERGED, #112) → **13b** core blob-sync engine + `CryptoBox` port + cap/quota types (this) →
**13c** web upload/download wiring + quota UX → **13d** mobile wiring (device-bound).

## Goal
The pure, platform-free **blob-sync engine** that 13c/13d drive: given the set of synced documents
(contentIds) and the local `BlobStore`, it **plans** which blobs to upload (local bytes not yet on
the server) and download (synced docs whose bytes aren't local yet), **encrypts on upload /
decrypts on download** through an injected `CryptoBox`, calls the 13a server through an injected
`BlobTransport`, and **branches on 13a's return-union** `saveBlob` result — marking an
over-cap/over-quota blob "deferred / kept local" instead of throwing. Mirrors the 12b reconciler:
ports + a pure driver, no `convex`/`@ember/store`/platform import, fully testable with fakes.
**No HTTP, no Web Crypto / expo-crypto math, no client wiring, no UI here** (13c/13d).

## Resolved forks (umbrella #13, 2026-06-26) — inherited, do not re-litigate
- **Client-side symmetric encryption (non-ZK), AES-256-GCM.** The per-user key is escrowed by 13a
  (`getOrCreateBlobKey`). Core stays key-agnostic: it sees only an opaque `CryptoBox`.
- **Over-limit ⇒ keep local, skip upload, retry later.** `saveBlob` returns `{ ok:false, code }`
  (13a contract); the engine records the blob as `deferred` and leaves the file fully local +
  readable (invariant #1). **The *when* to retry is a client policy (13c/13d)** — see `retryDeferred`.
- **Eager background download.** 13b provides the `downloadBlob` mechanism; the *when* (after each
  pull) is the client's (13c/13d).
- **50 MB/file · 1 GB/user**, server-authoritative (13a constants; the engine never re-checks them).

## Design decisions (this slice — implementation shape, not product forks)
- **`storageId` and upload/download URLs NEVER enter core.** 13a keeps `storageId` server-internal;
  13b keeps it client-binding-internal. `BlobTransport.upload(ciphertext)` returns a `{ storageId }`
  opaque string the engine immediately hands back to `saveBlob`; `download(contentId)` returns bytes
  (the binding does `getDownloadUrl` + `fetch`). Core orchestrates bytes ⇄ contentId only.
- **Upload state is tracked locally** (the spec's "which contentIds are uploaded / need download").
  A per-contentId status record in a local-only `blob-sync` collection — `{ id: contentId,
  status: 'synced' | 'deferred', code? }` — read/written through a structural `SyncStore`-style port
  (same pattern as 12b's `sync-meta` cursor; **no `Repository`/store change, never enqueued, never
  pushed**). Avoids re-probing `getDownloadUrl` for every doc every cycle.
- **`CryptoBox` encapsulates the key.** The binding (13c/13d) fetches the key once per session via
  `getOrCreateBlobKey`, imports it to a non-extractable `CryptoKey`, and constructs ONE `CryptoBox`;
  core calls `encrypt`/`decrypt` on opaque bytes. (Key-cache contract = the binding's obligation,
  documented here; core holds no key.)

## Implementation — `packages/core/src/blob-sync.ts` (new) + barrel export

### Result + limit types (mirror 13a exactly — this is the shared contract 13c/13d branch on)
```ts
export type SaveBlobResult =
  | { ok: true }
  | { ok: false; code: 'missing-upload' }
  | { ok: false; code: 'over-file-cap'; limit: number; attempted: number }
  | { ok: false; code: 'over-quota'; limit: number; used: number; attempted: number };

export type BlobLimits = { used: number; quota: number; fileCap: number }; // = 13a getStorageUsage
export const BLOB_SYNC_COLLECTION = 'blob-sync'; // local-only status records
export type BlobStatus = { id: string; status: 'synced' | 'deferred'; code?: SaveBlobReject['code'] };
export type BlobSyncReport = { uploaded: number; downloaded: number; deferred: number; failed: number };
```
(`SaveBlobReject` = the `ok:false` arm; pull `code` from it so the strings stay single-sourced.)

### Ports (structural, injected — same convention as `sync-transport.ts`)
```ts
/** Opaque per-user AEAD. Binding builds it from getOrCreateBlobKey + Web Crypto/expo-crypto. */
export interface CryptoBox {
  encrypt(plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): Promise<Uint8Array>;
}

/** Client mirror of the 13a fns. URLs + storageId stay inside the binding. */
export interface BlobTransport {
  upload(ciphertext: Uint8Array): Promise<{ storageId: string }>; // generateUploadUrl + POST
  saveBlob(contentId: string, storageId: string): Promise<SaveBlobResult>;
  download(contentId: string): Promise<Uint8Array | null>; // getDownloadUrl + fetch; null = not on server yet
  deleteBlob(contentId: string): Promise<void>;
}

/** Structural subset of store/BlobStore the engine needs (mirrors SyncStore). */
export interface BlobBytes {
  has(id: string): Promise<boolean>;
  get(id: string): Promise<Uint8Array | undefined>;
  put(id: string, bytes: Uint8Array): Promise<void>;
}

/** Local-only status access — satisfied structurally by the existing Repository (no store change). */
export interface BlobStatusStore {
  get<T extends { id: string }>(collection: string, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(collection: string, record: T): Promise<void>;
}
```

### Pure planner
- **`planBlobSync(args: { syncedIds: string[]; localIds: Set<string>; statusOf: (id) => BlobStatus | undefined; retryDeferred?: boolean }) → { toUpload: string[]; toDownload: string[] }`**
  - `toUpload` = ids whose **bytes are local** (`localIds.has(id)`) AND status is not `synced` AND
    (status is not `deferred` **unless** `retryDeferred`). Dedupe; stable order.
  - `toDownload` = `syncedIds` whose **bytes are NOT local** (`!localIds.has(id)`). (Downloaded blobs
    are by definition under the server limits — no cap check on the down path.)
  - Pure (no I/O) so it's trivially unit-tested; the driver gathers the inputs.

### Operations (each fail-soft, never throws on a *limit* rejection)
- **`uploadBlob(contentId, deps) → SaveBlobResult`**: `bytes = blobs.get(contentId)`; if `undefined`
  → return `{ ok:false, code:'missing-upload' }` (nothing local to send). `ct = crypto.encrypt(bytes)`
  → `{ storageId } = transport.upload(ct)` → `res = transport.saveBlob(contentId, storageId)`. On
  `res.ok` → write status `{ id, status:'synced' }`; on `!res.ok` → write `{ id, status:'deferred',
  code:res.code }`. Return `res`. **Branches on the 13a return-union — does not catch a throw for limits.**
- **`downloadBlob(contentId, deps) → boolean`**: `ct = transport.download(contentId)`; if `null` →
  return `false` (server doesn't have it yet; stay local-less). `pt = crypto.decrypt(ct)` →
  `blobs.put(contentId, pt)` → status `{ id, status:'synced' }` → return `true`.
- **`forgetBlob(contentId, deps)`**: `transport.deleteBlob(contentId)` then drop/forget local status
  (status record removed or marked) — for 13c/13d tombstone GC. Idempotent (mirrors 13a `deleteBlob`).

### Driver
- **`reconcileBlobs(deps: { syncedIds: string[]; blobs: BlobBytes; transport: BlobTransport;
  crypto: CryptoBox; status: BlobStatusStore; retryDeferred?: boolean }) → BlobSyncReport`**:
  1. Build `localIds` by probing `blobs.has` over the union of `syncedIds` + any locally-imported
     ids the caller passes (caller supplies `syncedIds`; for upload the caller passes locally-known
     ids too — see note). Read each id's status via `status.get(BLOB_SYNC_COLLECTION, id)`.
  2. `{ toUpload, toDownload } = planBlobSync(...)`.
  3. For each `toUpload`: `uploadBlob`; tally `uploaded` / `deferred` from the result.
  4. For each `toDownload`: `downloadBlob`; tally `downloaded`.
  5. **Per-blob try/catch around genuine I/O faults** (network) so one failure doesn't abort the
     batch — increment `failed`, leave status untouched, continue. (Limit rejections are NOT faults —
     they come back as `{ ok:false }` and become `deferred`, not `failed`.)
  - Return `{ uploaded, downloaded, deferred, failed }`.
  - **Note on the upload candidate set:** synced-doc ids cover the download side; the upload side also
    needs locally-imported docs not yet reflected in `syncedIds`. Pass the full candidate id list in
    via `deps` (caller derives from `listDocuments`); `syncedIds` ⊆ candidates. Keep the planner's two
    inputs explicit so this stays testable. (Finalize the exact param name in the executor; one list
    of candidate ids + a `syncedIds`/`localIds` derivation is fine — do not add a store dependency.)

### Barrel
Add `export * from './blob-sync.js';` to `packages/core/src/index.ts` (after `reconcile.js`).

## Invariants
- **#1** storage off the read path: the engine only moves bytes in/out of the LOCAL `BlobStore`;
  reads still hit local. Download is eager background (client-scheduled). ✓
- **#2** blob metadata is a **direct authed transport call by design, NOT an outbox mutation** — the
  engine calls `BlobTransport` directly and **never enqueues**; the document *record* still syncs via
  12 unchanged. The `blob-sync` status records are **local-only** (never pushed), exactly like 12b's
  `sync-meta` cursor. ✓
- **#5** no merge logic: blobs are content-addressed by `contentId` (= sha256 of plaintext) → identical
  bytes ⇒ identical blob ⇒ no conflict to merge. The engine contains zero LWW/merge code. ✓
- **core purity:** no `convex`, no `@ember/store`, no platform crypto/HTTP import — all injected.

## Dependencies
- none new. Pure `packages/core`. Tests use in-memory fakes: an identity/XOR `CryptoBox`, a
  `Map`-backed `BlobBytes`, a fake `BlobTransport` returning canned `SaveBlobResult`s, a `Map`-backed
  `BlobStatusStore`. No `@ember/store` import in tests (mirror 12b's reconciler tests).

## Verify when done
- [ ] `planBlobSync` returns the correct upload/download partition for: nothing synced; some local
      not uploaded; synced-but-not-local (download); already `synced` (skipped both ways); `deferred`
      excluded unless `retryDeferred` then included in `toUpload`.
- [ ] `uploadBlob` encrypts then `upload`→`saveBlob`; on `ok:true` marks `synced`; on each reject
      code (`over-file-cap`/`over-quota`/`missing-upload`) marks `deferred` with that `code` and
      **returns the union without throwing**; missing local bytes ⇒ `{ok:false,'missing-upload'}`.
- [ ] `downloadBlob` returns `false` + no write when `transport.download` is `null`; otherwise
      decrypts, `blobs.put`s the plaintext, marks `synced`, returns `true`. Round-trip with the fake
      CryptoBox: `decrypt(encrypt(x)) === x` bytes preserved.
- [ ] `forgetBlob` calls `transport.deleteBlob` and clears status; idempotent (second call no-op).
- [ ] `reconcileBlobs` end-to-end on fakes: uploads pending, downloads missing, tallies
      `uploaded/downloaded/deferred/failed`; a thrown network fault on one blob increments `failed`
      and does **not** abort the rest (fail-soft); a limit reject increments `deferred` not `failed`.
- [ ] No `@ember/store` / `convex` / platform import in `blob-sync.ts` (core purity); barrel exports it.
- [ ] `pnpm -w typecheck` · `pnpm -w test` (new core cases) · `pnpm -w lint` all pass.
- [ ] No invariant violated — esp. **#1** (local-only byte movement), **#2** (no enqueue; status
      records local-only), **#5** (zero merge logic).

## Deferred to 13c / 13d (do NOT solve here)
- Real `CryptoBox` bindings (Web Crypto `subtle` AES-GCM / expo-crypto) + key fetch/cache/import from
  `getOrCreateBlobKey`; real `BlobTransport` over `api.files.*` + `fetch` to the upload/download URLs.
- *When* to run `reconcileBlobs` (after each 12 pull / on import), *when* to flip `retryDeferred`
  (e.g. after a tombstone frees space), the over-limit "kept local / not synced" UX + quota indicator
  from `getStorageUsage`, and tombstone-driven `forgetBlob`. 13d is device-bound.

## Deploy gate
**None** — pure `packages/core`, no schema/deployment change (13a already deployed).
