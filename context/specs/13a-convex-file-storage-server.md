# Unit 13a: Convex file-storage server — upload/download URLs, blob mirror, cap + quota, key escrow

Issue: #111 (umbrella #13) · Branch: feat/111-convex-file-storage-server · Boundary: `convex/`
Route: standard — one boundary, well-trodden Convex storage/fn logic, forks resolved; no new dep
(`convex-test` already present from 12a).

First slice of umbrella **#13** (File storage sync + quota), split by boundary like 03a–c · 11a–c ·
12a–d: **13a** Convex file-storage server (this) → **13b** core/store blob-sync engine + client
crypto port → **13c** web upload/download wiring + quota UX → **13d** mobile wiring (device-bound).

## Goal
A deployed Convex file-storage server an authed user can: get a short-lived **upload URL**, register
an uploaded **ciphertext** blob (`saveBlob`) under **server-enforced** per-file cap + per-user quota,
get a **download URL** for a blob by `contentId`, fetch a **per-user symmetric key**, and **delete** a
blob on document tombstone. The server stores **opaque encrypted bytes** and is authoritative for
limits. **No client wiring, no reconciler, no crypto math here** (13b/13c/13d).

## Resolved forks (2026-06-26)
- **Client-side symmetric encryption (non-ZK).** Convex stores ciphertext blobs; it also escrows a
  per-user AES-256-GCM key in a `userKeys` row, returned over the authed channel. Zero-knowledge E2E
  stays deferred (project-overview "out of scope"). Server never sees plaintext; it does see the key
  (that is what "non-ZK" buys — new devices can decrypt).
- **Over-limit ⇒ keep local, skip upload.** `saveBlob` *rejects* an over-cap/over-quota blob by
  **returning** `{ ok:false, code, ... }` (NOT throwing) and deletes the just-uploaded storage object;
  the client keeps the file local-only and readable (invariant #1) and retries later. Server never
  silently truncates.
  **Why return, not throw:** a Convex mutation is a transaction — a `throw` rolls back the
  `ctx.storage.delete()` cleanup in the same call, orphaning the uploaded ciphertext forever (no GC job
  in scope). Returning lets the cleanup commit. So `saveBlob` returns a discriminated union and 13b/c/d
  branch on `result.ok` / `result.code` (resolved 2026-06-26 during 13a build).
- **50 MB per file · 1 GB per user.** Authoritative server constants (`FILE_CAP`/`USER_QUOTA`).
- **Eager background download (13c/d concern).** 13a only needs `getDownloadUrl`; the *when* is client.

## Key design: blobs are addressed by `contentId`, never by `storageId` on the client
`contentId` = the document id = lowercase-hex SHA-256 of the **plaintext** bytes (04a `Document.id`).
The synced document record (collection `documents`, unit 12) tells every device a doc exists; each
device independently uploads/downloads its bytes **by `contentId`**. `storageId` is Convex-internal
and **must not** live on the synced record or leave the server — so 13a adds a separate owner-scoped
`blobs` table mapping `(owner, contentId) → storageId`. Same account ⇒ device B resolves device A's
`contentId` to the one shared blob row. **No change to the `records`/`syncState` tables or the synced
`Document` shape.**

## Implementation

### `convex/schema.ts` — add two owner-scoped tables (keep `...authTables`, `records`, `syncState`)
```ts
blobs: defineTable({
  owner: v.id("users"),
  contentId: v.string(),         // = Document.id (sha256 hex of PLAINTEXT bytes, 04a)
  storageId: v.id("_storage"),   // Convex-internal; never sent to clients
  encryptedSize: v.number(),     // actual stored ciphertext byte length (quota unit)
})
  .index("by_owner_content", ["owner", "contentId"])
  .index("by_owner", ["owner"]),

userKeys: defineTable({ owner: v.id("users"), key: v.string() }) // base64 AES-256-GCM key
  .index("by_owner", ["owner"]),
```

### `convex/files.ts` — constants + 6 functions (all authed via `getAuthUserId`, throw if `null`)
Constants (server is the authority — single source; clients read them via `getStorageUsage`):
```ts
export const FILE_CAP = 50 * 1024 * 1024;     // 50 MB per file
export const USER_QUOTA = 1024 * 1024 * 1024; // 1 GB per user
```

- **`generateUploadUrl = mutation({})`** → `owner = getAuthUserId`; `return ctx.storage.generateUploadUrl()`.
  The client POSTs ciphertext to this URL and gets back a `storageId`.

- **`saveBlob = mutation({ contentId: v.string(), storageId: v.id("_storage") })`** — register +
  enforce limits, server-authoritative on the **actual stored size**. Returns a discriminated union
  `{ ok:true } | { ok:false, code, ... }` — **never throws on a limit/missing rejection** (throwing
  would roll back the storage cleanup, see fork note):
  1. `owner = getAuthUserId` (throw only on unauthenticated).
  2. `size = (await ctx.db.system.get(storageId))?.size` — read true ciphertext length from the
     `_storage` system table (do **not** trust a client-reported size). If the storage doc is missing,
     `return { ok:false, code:"missing-upload" }` (nothing to clean up).
  3. **Per-file cap:** `size > FILE_CAP` → `await ctx.storage.delete(storageId)` (commits) then
     `return { ok:false, code:"over-file-cap", limit: FILE_CAP, attempted: size }`.
  4. **Per-user quota:** `used = sum(encryptedSize)` over `by_owner` rows, **excluding** any existing
     row for this `contentId` (re-upload replaces, not adds). If `used + size > USER_QUOTA` →
     `ctx.storage.delete(storageId)` then `return { ok:false, code:"over-quota", limit: USER_QUOTA, used, attempted: size }`.
  5. **Upsert** by `by_owner_content`: if a row exists, `ctx.storage.delete(oldRow.storageId)` first
     (avoid orphan + double-count), then `patch`; else `insert`. Store `encryptedSize: size`.
  6. `return { ok: true }`.

- **`getDownloadUrl = query({ contentId: v.string() })`** → `owner = getAuthUserId`; find the owner's
  `by_owner_content` row; `return row ? await ctx.storage.getUrl(row.storageId) : null` (null = this
  account hasn't uploaded the blob yet — client stays on its local copy).

- **`getOrCreateBlobKey = mutation({})`** → `owner = getAuthUserId`; load `by_owner` `userKeys` row; if
  absent, generate a 256-bit key (`crypto.getRandomValues(new Uint8Array(32))` → base64) and insert it;
  `return { key }`. Mutation (not query) because first call writes. Idempotent thereafter — same key.

- **`deleteBlob = mutation({ contentId: v.string() })`** → `owner = getAuthUserId`; find the row; if
  present `ctx.storage.delete(storageId)` + `ctx.db.delete(row._id)`. Idempotent (no row = no-op).
  Called by 13c/d when a document is tombstoned (GC); 13a only provides + tests the endpoint.

- **`getStorageUsage = query({})`** → `owner = getAuthUserId`; `used = sum(encryptedSize)`;
  `return { used, quota: USER_QUOTA, fileCap: FILE_CAP }` (drives 13c/d quota indicator).

### Ownership isolation
Every `blobs`/`userKeys` row carries `owner`; every fn derives `owner` from `ctx.auth` and only
touches its own rows/storage. User B can never download, count against, overwrite, or delete User A's
blobs, nor read A's key. Server complement of invariant #1, built on unit 11's auth.

### Rejection typing (return-union, not `ConvexError`)
`saveBlob` returns `{ ok:false, code, ... }` with stable `code` strings
(`over-file-cap` | `over-quota` | `missing-upload`) so 13c/d branch on `result.code` to drive the
"kept local, not synced" UX without string-matching. Returning (not throwing) is mandatory so the
orphan-cleanup `ctx.storage.delete()` commits — a throw would roll the whole mutation back. Genuine
faults (unauthenticated) still throw.

## Dependencies
- none new. `convex@1.40.0`, `@convex-dev/auth@0.0.94`, `convex-test@0.0.53` + `@edge-runtime/vm`
  (edge-runtime vitest project) already pinned/configured from 11a/12a. No core/store/client change.

## Verify when done
- [ ] `generateUploadUrl` (authed) returns a URL; unauthenticated throws.
- [ ] `saveBlob` registers a blob and `getDownloadUrl(contentId)` then returns a non-null URL; an
      unknown `contentId` returns `null`.
- [ ] A blob whose stored size `> FILE_CAP` is rejected with `{ ok:false, code:"over-file-cap" }`
      **and the storage object is deleted** (no orphan, usage unchanged).
- [ ] When `used + size > USER_QUOTA`, `saveBlob` returns `{ ok:false, code:"over-quota" }` and deletes
      the upload (no orphan); a re-upload of an existing `contentId` replaces (does not double-count) and
      frees the old storage object.
- [ ] A missing/already-deleted `storageId` returns `{ ok:false, code:"missing-upload" }` (no throw).
- [ ] `getOrCreateBlobKey` mints once and returns the **same** key on subsequent calls.
- [ ] `deleteBlob` removes row + storage object and is idempotent; `getStorageUsage` reflects
      register/replace/delete (`used` accurate, `quota`/`fileCap` constant).
- [ ] User B never sees User A's blob (`getDownloadUrl`/`getStorageUsage`), key, and cannot delete it;
      all six fns throw when unauthenticated.
- [ ] `pnpm -w typecheck` passes (`v`-validated args; `@convex-dev/eslint-plugin` clean)
- [ ] `pnpm -w test` passes (new `convex/` `convex-test` cases — store a blob in tests via
      `t.run((ctx) => ctx.storage.store(new Blob([bytes])))`, then exercise the fns)
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated — esp. **#1** (storage is off the read path: clients read local bytes;
      Convex only serves download URLs for eager background fetch), **#2** (file metadata is NOT a
      syncable mutation through the outbox — it is a direct authed storage call by design; the document
      *record* still syncs via the outbox/12 unchanged), and **#5** (no merge logic here).

## Deferred to 13b/13c/13d (do NOT solve here)
- **13b:** core blob-sync state (which `contentId`s are uploaded / need download), the `CryptoBox` port
  (encrypt/decrypt) + key-cache contract, and how the eager-download set is derived from the synced
  `documents` records vs the local `BlobStore`. No client crypto impl here.
- **13c/13d:** encrypt-on-import → `generateUploadUrl` → POST → `saveBlob`; eager background download +
  decrypt on pull; `deleteBlob` on tombstone; over-limit "kept local / not synced" UX + quota
  indicator from `getStorageUsage`; secure caching of the fetched key (web Crypto / SecureStore).

## USER deploy gate (deployment-bound, before merge)
`npx convex dev --once` at repo root → push `blobs` + `userKeys` schema (2 new tables, 3 indexes) to
dev `necessary-warbler-246` — same gate class as 11a/12a; no headless substitute for a real schema
push. Confirm the deploy is clean and the tables appear in the dashboard.
