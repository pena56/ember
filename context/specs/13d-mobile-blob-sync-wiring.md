# Unit 13d — Mobile blob-sync wiring

- **Issue:** #117 (umbrella #13)
- **Branch:** `feat/117-mobile-blob-sync-wiring`
- **Route:** standard (one boundary `apps/mobile`; all forks resolved). **Device-bound** + **UI unit**.
- **Chain:** `Unit 13d ⇄ Issue #117 ⇄ branch feat/117-mobile-blob-sync-wiring ⇄ spec specs/13d-mobile-blob-sync-wiring.md ⇄ PR "Closes #117"`

## 1. Goal / visible result

Final slice of umbrella #13. The **device-bound mirror of 13c** (#115, web) inside the
mobile app: wire 13b's pure `blob-sync` engine (`reconcileBlobs`) to the already-deployed
13a Convex file-storage server, so a PDF imported on one device encrypts, uploads, and
eager-downloads onto the user's other devices. Adds a per-row **sync badge** and a **quota
meter** to the Library screen, with over-cap / over-quota files kept fully readable on-device.

Nothing in `packages/*` or `convex/` changes. 13a (server) and 13b (engine) are merged and
unchanged; this unit is pure client wiring + UI, exactly as 13c was for web.

## 2. Context to read (and ONLY this)

Mirror the web 13c deliverables — read these as the reference implementations:
- `apps/web/src/store/web-crypto-box.ts` — CryptoBox + `loadBlobKey` shape to mirror.
- `apps/web/src/sync/convex-blob-transport.ts` — BlobTransport over `api.files.*` + fetch.
- `apps/web/src/sync/use-storage-usage.ts` — auth-gated `useQuery` wrapper.
- `apps/web/src/sync/use-blob-sync.ts` — scheduler logic incl. **over-cap pre-skip** (refinement #1).
- `apps/web/src/store/store-context.tsx` — `SyncBundle` + `blobChange` signal (refinement #2).
- `apps/web/src/library/use-library.ts` — doc⨝status join + `blobChange` subscription.
- `apps/web/src/library/document-row.tsx` + `storage-meter.tsx` — badge + meter UX (copy verbatim).
- `apps/web/src/App.tsx` — `useBlobSync({fileCap})` wiring point.

Mobile boundary files to mirror against (already exist):
- `apps/mobile/src/sync/sync-scheduler.ts` + `use-reconciler.ts` — the **pure-scheduler + thin-hook**
  split this unit must replicate for blob-sync (mobile vitest is node env, no jsdom).
- `apps/mobile/src/store/store-context.tsx` — async-init `SyncBundle` to extend.
- `apps/mobile/src/store/native-store.ts` — add `listBlobStatuses()`.
- `apps/mobile/src/store/expo-file-system-blob-store.ts` — the local `BlobBytes` (has/get/put).
- `apps/mobile/src/store/expo-crypto-hasher.ts` + `base64.ts` — platform-crypto + base64 patterns.
- `apps/mobile/src/library/use-library.ts` + `document-row.tsx` + `library-screen.tsx` — UI to extend.
- `apps/mobile/src/convex/convex-client.ts` (nullable singleton) + `app/_layout.tsx` (gate).

Engine surface (already in `@ember/core`, do NOT change): `reconcileBlobs`, `CryptoBox`,
`BlobTransport`, `BlobBytes`, `BlobStatusStore`, `BlobStatus`, `BlobLimits`, `SaveBlobResult`,
`BLOB_SYNC_COLLECTION`.

## 3. Deliverables (all under `apps/mobile/src` unless noted)

### Crypto
- **`store/native-crypto-box.ts`** — `createNativeCryptoBox(key: Uint8Array): CryptoBox` using
  **@noble/ciphers** `gcm` (AES-256-GCM). `encrypt`: 12-byte IV from `expo-crypto.getRandomBytes(12)`,
  `gcm(key, iv).encrypt(plaintext)` → output is `ciphertext ‖ 16-byte tag`; return `IV ‖ ciphertext ‖ tag`.
  `decrypt`: split first 12 bytes as IV, `gcm(key, iv).decrypt(rest)`. **Byte-compatible with web's
  Web Crypto AES-GCM** (same standard layout) so cross-device decrypt works. `loadBlobKey(client)` mirrors
  web: `client.mutation(api.files.getOrCreateBlobKey)` → `{ key: base64 }` → decode via the existing
  `base64ToBytes` (NOT `atob` — not in RN) → raw 32 bytes (kept in memory, never logged).

### Transport + queries
- **`sync/convex-blob-transport.ts`** — `createConvexBlobTransport(client)` → `BlobTransport`.
  Mirror web exactly: `upload` (generateUploadUrl → POST ciphertext → parse `storageId`), `saveBlob`
  (pass `SaveBlobResult` union straight through; same `as any` storageId cast as web, with comment),
  `download` (getDownloadUrl → null-guard → fetch arrayBuffer), `deleteBlob`. **storageId + URLs never
  leave this binding.** `fetch` is a global in RN — no polyfill needed.
- **`sync/use-storage-usage.ts`** — `useQuery(api.files.getStorageUsage, isAuthenticated ? {} : 'skip')`
  → `BlobLimits | undefined`. Identical to web.

### Scheduler (pure) + adapter (thin) — the 12d split, repeated
- **`sync/blob-sync-scheduler.ts`** — **pure, injectable, no platform imports** (node-testable), mirroring
  `sync-scheduler.ts`: overlap-guarded, trailing-coalescing `run()` with async `isOnline()` gate inside the
  loop, structural `AppStateLike`/`NetworkLike` ports, interval(15s)+lifecycle+debounced-signal triggers,
  fail-soft (swallow errors). Differences from record-sync scheduler:
  - `runOnce` does ONE blob-sync pass: `listDocuments()` → **over-cap pre-skip** (refinement #1 — when
    `fileCap` is known, pre-mark each doc whose `byteSize > fileCap` as `{status:'deferred',code:'over-file-cap'}`
    via `blobStatus.put` and exclude it from `candidateIds`, even on a retryDeferred pass) → `reconcileBlobs(
    {candidateIds, blobs, transport, crypto, status: blobStatus, retryDeferred})`.
  - **After every pass (finally block) fire `blobChange.notify()`** (refinement #2) so the library re-reads
    badges without a remount — even on a swallowed failure (pre-skip writes still land).
  - Exposes a one-shot `retryDeferred()` path (`run(true)`).
  - `fileCap` is a dep (re-create scheduler when it changes), matching web's effect dep.
- **`sync/use-blob-sync.ts`** — thin RN adapter (mirrors `use-reconciler.ts`): gated on
  `useConvexAuth().isAuthenticated && bundle !== null`; lazily build transport (lazy-import convex singleton,
  bail if null) + crypto (`loadBlobKey` once, cache in ref); inject `AppState`, `expo-network`, `isOnline`,
  `bundle.signal`, `bundle.blobChange`, ports + `fileCap` into `createBlobSyncScheduler`. Returns
  `{ retryDeferred }`. Intentionally untested glue (like `use-reconciler.ts`), covered by typecheck.

### Store wiring
- **`store/store-context.tsx`** — extend `SyncBundle` with `blobs: BlobBytes`, `blobStatus: BlobStatusStore`
  (the same repo cast structurally, like web), and `blobChange: SyncSignal`. Build them in the async `init()`
  next to `signal` (`const blobChange = createSyncSignal();`, `blobs` = the `ExpoFileSystemBlobStore` already
  constructed, `blobStatus: repo`). Bundle stays null in injected-store/headless runs.
- **`store/native-store.ts`** — add `listBlobStatuses(): Promise<BlobStatus[]>` → `repo.query<BlobStatus>(
  BLOB_SYNC_COLLECTION)` (read-only, no enqueue). Import `BLOB_SYNC_COLLECTION` + `BlobStatus` from `@ember/core`.

### UI (token-only, a11y — invariant #6)
- **`library/use-library.ts`** — add `SyncState` + `DocumentWithSync` (copy web's `deriveSyncState`); join
  `listDocuments()` ⨝ `listBlobStatuses()` into `documents: DocumentWithSync[]`; subscribe to
  `bundle.blobChange` → `refresh` (null-guard the bundle, mirroring web). Keep `pickAndImport` + toasts.
- **`library/document-row.tsx`** — add a `SyncBadge` (RN `Text`/`Pressable`): `synced`→null,
  `pending`→"Syncing…", `over-file-cap`→"Too large to sync — kept on this device", `over-quota`→"Storage full
   — kept on this device" + a "Try again" `Pressable` (calls `onRetrySync`; `e`-free, RN has no nested-button
  issue but keep tap from also opening — wrap so the badge Pressable stops propagation). Copy verbatim from web.
  Accept `document: DocumentWithSync` + optional `onRetrySync`.
- **`library/storage-meter.tsx`** — RN port of web meter: `useStorageUsage()`, hidden while undefined, calm
  below 80% / `streak-lit` token at/above 80%; render a `View` track + filled `View` (width %); a11y
  `accessibilityRole="progressbar"` + `accessibilityValue={{min,max,now}}`. Token-only.
- **`library/library-screen.tsx`** — render `<StorageMeter/>` in the `ListHeaderComponent` (below the
  ImportCard); pass `syncState`/`onRetrySync` through `renderRow`. Thread `retryDeferred` from a
  `useBlobSync()` call (or via the screen's existing hook chain — keep it inside the convex-gated path).
  Note: `useBlobSync` is mounted in `app/_layout.tsx`'s gate (below); the screen needs `retryDeferred`, so
  either (a) lift `useBlobSync` to a context, or (b) call `useBlobSync()` in the screen too — prefer a small
  context/prop so the scheduler mounts once. Executor picks the cleanest; document the choice.
- **`app/_layout.tsx`** — in `AnonymousAuthGate` (already convex-gated), call `useBlobSync({fileCap})` with
  `fileCap` from `useStorageUsage()`, mirroring web's `App.tsx`. This is the single scheduler mount.

### Dependency
- Add **`@noble/ciphers`** to `apps/mobile/package.json` deps (pure JS — `pnpm add`, NOT `expo install`; no
  native module, so no SDK-56 alignment concern). Pin exact (house style).

### Device-verify (throwaway — per the established convention)
- Add `app/dev/blob-sync-13d.tsx` fed by `src/dev/verification-harness.tsx`, listed in `app/dev/index.tsx`,
  reached via the `__DEV__` home link. Interactive checks: (1) crypto round-trip + a known web-produced
  ciphertext decrypts (cross-platform parity); (2) import → badge goes Syncing…→synced live (no remount);
  (3) >50 MB file → "Too large to sync" badge, excluded from quota meter. **Delete `app/dev/blob-sync-13d.tsx`
  + its index entry in the same PR once green** (the real adapters stay).

## 4. Invariants / constraints

- **#1** — bytes only move in/out of the local `ExpoFileSystemBlobStore`; the reader keeps reading local
  bytes; download is eager background only. Convex never on the read path.
- **#2** — blob metadata is a direct authed transport call (never enqueued); blob-status records are written
  via `repo.put`/`delete` with **no notify, no enqueue** — local-only, never pushed. `blobChange` is a
  separate LOCAL UI signal, not the outbox wake.
- **#5** — content-addressed by contentId ⇒ zero merge logic in `apps/mobile`.
- **#6** — token-only UI (no hardcoded colors); uniwind className on RN core views only (02d carry-forward).
- **No change** to `packages/core`, `packages/store`, `convex/`. No deploy gate (client wiring vs deployed 13a).
- Metro `.js` import convention holds (resolver strips `.js`). Barrel safety: never import vitest/node-only
  modules from a path Metro bundles (03c carry-forward).

## 5. Tests (apps/mobile, vitest node env — `*.test.ts` only, no jsdom)

- `native-crypto-box.test.ts` — round-trip; IV uniqueness across calls; tamper → throws; **cross-platform
  vector**: decrypt a ciphertext produced by web's AES-GCM with the same key (assert byte-equality of the
  scheme by encrypting with a fixed key+IV and checking layout). `getRandomBytes` mocked/injected.
- `convex-blob-transport.test.ts` — mapping over a fake client + mocked `fetch` (storageId/URL containment,
  saveBlob union pass-through, download null-skip).
- `blob-sync-scheduler.test.ts` — auth/online gating, mount/interval/signal/foreground/reconnect triggers,
  offline-skip, overlap-coalesce (maxConcurrent===1), error-swallow, **over-cap pre-skip** (over-`fileCap`
  doc pre-marked + excluded from candidateIds), **`blobChange` fired after each pass** (incl. on failure),
  `retryDeferred` includes deferred, teardown. In-memory fakes for transport/crypto/blobs/status (no
  `@ember/store` import — use the engine's structural ports).
- `native-store-blob-status.test.ts` (or extend native-store test) — `listBlobStatuses()` returns put records,
  is read-only (no outbox entry written).
- `use-blob-sync.ts` is untested glue (typecheck only), like `use-reconciler.ts`.
- UI components (RN) are not headless-tested here (no jsdom) — covered by the device-verify screen, matching
  the existing mobile convention (use-library/library-screen aren't unit-tested on mobile).

## 6. Dispatch

Standard route: **Sonnet TDD executor** (build test-first against the pure scheduler + crypto + transport) →
since this is a **UI unit**, run **frontend-design** (badge + meter, net-new mobile surfaces) then
**impeccable** (UX/visual/a11y, honoring `ui-context.md` tokens) on the Library changes → **fresh-context Opus
reviewer** (`code-review`): verify invariants #1/#2/#5/#6 + core purity + **no core/store/convex package change**
+ storageId/URLs never leave the binding + status records never enqueued + cross-platform ciphertext layout +
the pure-scheduler/thin-hook split. PR body `Closes #117`.

**USER device-verify before merge** (two devices, same account): import on device A → badge Syncing…→synced
live; appears + eager-downloads on device B; a >50 MB file ⇒ "Too large to sync — kept on this device",
excluded from the quota meter; over-quota ⇒ "Storage full" + Try-again retries. Then squash-merge + delete
branch; close #117; umbrella #13 COMPLETE.

## Verify commands
`pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint`
