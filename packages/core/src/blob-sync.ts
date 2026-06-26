// Blob-sync engine — pure, platform-free driver that 13c (web) / 13d (mobile) wire.
// Mirrors the 12b reconciler: structural injected ports + a pure driver.
// Core purity: NO convex / @ember/store / platform crypto / HTTP import — all injected.
// Invariant #1: byte movement is LOCAL-only (BlobBytes); reads still hit local.
// Invariant #2: NEVER enqueues an outbox entry — blob metadata is a direct authed
//               transport call; the blob-sync status records are local-only (BlobStatusStore).
// Invariant #5: blobs are content-addressed by contentId → zero merge logic here.

// ---------------------------------------------------------------------------
// Result + limit types — mirror the 13a server contract (convex/files.ts) exactly.
// This is the shared union 13c/13d branch on; saveBlob RETURNS limits, never throws.
// ---------------------------------------------------------------------------

export type SaveBlobResult =
  | { ok: true }
  | { ok: false; code: 'missing-upload' }
  | { ok: false; code: 'over-file-cap'; limit: number; attempted: number }
  | { ok: false; code: 'over-quota'; limit: number; used: number; attempted: number };

/** The ok:false arm — single-sources the reject codes for BlobStatus. */
export type SaveBlobReject = Extract<SaveBlobResult, { ok: false }>;

/** = 13a getStorageUsage. Server-authoritative; the engine never re-checks limits. */
export type BlobLimits = { used: number; quota: number; fileCap: number };

/** Local-only collection holding per-contentId sync status records. */
export const BLOB_SYNC_COLLECTION = 'blob-sync';

/** Per-contentId status record (local-only). */
export type BlobStatus = {
  id: string;
  status: 'synced' | 'deferred';
  code?: SaveBlobReject['code'];
};

export type BlobSyncReport = {
  uploaded: number;
  downloaded: number;
  deferred: number;
  failed: number;
};

// ---------------------------------------------------------------------------
// Ports — structural, injected (same convention as sync-transport.ts).
// ---------------------------------------------------------------------------

/** Opaque per-user AEAD. The binding builds it from getOrCreateBlobKey + Web Crypto / expo-crypto. */
export interface CryptoBox {
  encrypt(plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): Promise<Uint8Array>;
}

/** Client mirror of the 13a file fns. URLs + storageId stay inside the binding. */
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
  delete(collection: string, id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure planner
// ---------------------------------------------------------------------------

export type PlanBlobSyncArgs = {
  /** Candidate ids on the upload side (locally-known docs) — superset of syncedIds. */
  syncedIds: string[];
  localIds: Set<string>;
  statusOf: (id: string) => BlobStatus | undefined;
  retryDeferred?: boolean;
};

export type BlobSyncPlan = { toUpload: string[]; toDownload: string[] };

/**
 * Partition candidate ids into upload / download sets. Pure — no I/O.
 *
 * toUpload   = ids whose bytes are LOCAL and not already 'synced', and not 'deferred'
 *              unless retryDeferred. Deduped, stable order.
 * toDownload = synced ids whose bytes are NOT local (download is always under server
 *              limits — no cap check on the down path).
 */
export function planBlobSync(args: PlanBlobSyncArgs): BlobSyncPlan {
  const { syncedIds, localIds, statusOf, retryDeferred = false } = args;

  const toUpload: string[] = [];
  const toDownload: string[] = [];
  const seenUp = new Set<string>();
  const seenDown = new Set<string>();

  for (const id of syncedIds) {
    if (localIds.has(id)) {
      if (seenUp.has(id)) continue;
      const status = statusOf(id);
      if (status?.status === 'synced') continue;
      if (status?.status === 'deferred' && !retryDeferred) continue;
      seenUp.add(id);
      toUpload.push(id);
    } else {
      if (seenDown.has(id)) continue;
      seenDown.add(id);
      toDownload.push(id);
    }
  }

  return { toUpload, toDownload };
}

// ---------------------------------------------------------------------------
// Operations — each fail-soft; never throws on a *limit* rejection.
// ---------------------------------------------------------------------------

export type BlobOpDeps = {
  blobs: BlobBytes;
  transport: BlobTransport;
  crypto: CryptoBox;
  status: BlobStatusStore;
};

/**
 * Encrypt local bytes, upload ciphertext, then saveBlob. Branches on the 13a
 * return-union: ok:true → mark 'synced'; ok:false (any limit code) → mark 'deferred'
 * with that code. Missing local bytes → bare { ok:false, 'missing-upload' } (no status
 * written — nothing to defer). Does NOT
 * wrap saveBlob in try/catch to treat a limit as an error — genuine I/O faults are
 * the driver's fail-soft concern.
 */
export async function uploadBlob(contentId: string, deps: BlobOpDeps): Promise<SaveBlobResult> {
  const { blobs, transport, crypto, status } = deps;

  const bytes = await blobs.get(contentId);
  if (bytes === undefined) {
    // Nothing local to send — do NOT mark 'deferred' (there is nothing to defer). Writing a
    // status here would block a later legitimate upload of the same contentId once its bytes
    // are imported (planBlobSync excludes 'deferred' from toUpload unless retryDeferred).
    return { ok: false, code: 'missing-upload' };
  }

  const ciphertext = await crypto.encrypt(bytes);
  const { storageId } = await transport.upload(ciphertext);
  const res = await transport.saveBlob(contentId, storageId);

  if (res.ok) {
    await status.put<BlobStatus>(BLOB_SYNC_COLLECTION, { id: contentId, status: 'synced' });
  } else {
    await status.put<BlobStatus>(BLOB_SYNC_COLLECTION, {
      id: contentId,
      status: 'deferred',
      code: res.code,
    });
  }
  return res;
}

/**
 * Fetch server ciphertext, decrypt, and store plaintext locally. Returns false +
 * writes nothing when the server doesn't have the blob yet (download → null).
 */
export async function downloadBlob(contentId: string, deps: BlobOpDeps): Promise<boolean> {
  const { blobs, transport, crypto, status } = deps;

  const ciphertext = await transport.download(contentId);
  if (ciphertext === null) return false;

  const plaintext = await crypto.decrypt(ciphertext);
  await blobs.put(contentId, plaintext);
  await status.put<BlobStatus>(BLOB_SYNC_COLLECTION, { id: contentId, status: 'synced' });
  return true;
}

/**
 * Delete the server blob and clear local status. Idempotent (mirrors 13a deleteBlob).
 * For 13c/13d tombstone GC.
 */
export async function forgetBlob(
  contentId: string,
  deps: Pick<BlobOpDeps, 'transport' | 'status'>,
): Promise<void> {
  const { transport, status } = deps;
  await transport.deleteBlob(contentId);
  await status.delete(BLOB_SYNC_COLLECTION, contentId);
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export type ReconcileBlobsDeps = {
  /** Synced-doc ids (download side) PLUS locally-imported ids (upload side). syncedIds ⊆ candidateIds. */
  candidateIds: string[];
  blobs: BlobBytes;
  transport: BlobTransport;
  crypto: CryptoBox;
  status: BlobStatusStore;
  retryDeferred?: boolean;
};

/**
 * One blob-sync cycle: plan from local presence + status, then upload pending /
 * download missing. Fail-soft: a genuine I/O fault (transport throwing) on one blob
 * increments `failed` and continues — it does NOT abort the batch. A limit rejection
 * is NOT a fault: it comes back as { ok:false } and becomes `deferred`, not `failed`.
 */
export async function reconcileBlobs(deps: ReconcileBlobsDeps): Promise<BlobSyncReport> {
  const { candidateIds, blobs, transport, crypto, status, retryDeferred } = deps;

  // 1. Gather local presence + status for every candidate.
  const localIds = new Set<string>();
  const statusMap = new Map<string, BlobStatus>();
  for (const id of candidateIds) {
    if (await blobs.has(id)) localIds.add(id);
    const rec = await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, id);
    if (rec) statusMap.set(id, rec);
  }

  // 2. Plan.
  const { toUpload, toDownload } = planBlobSync({
    syncedIds: candidateIds,
    localIds,
    statusOf: (id) => statusMap.get(id),
    retryDeferred: retryDeferred ?? false,
  });

  const opDeps: BlobOpDeps = { blobs, transport, crypto, status };
  let uploaded = 0;
  let downloaded = 0;
  let deferred = 0;
  let failed = 0;

  // 3. Uploads — limit rejects ⇒ deferred; thrown faults ⇒ failed (continue).
  for (const id of toUpload) {
    try {
      const res = await uploadBlob(id, opDeps);
      if (res.ok) uploaded += 1;
      else deferred += 1;
    } catch {
      failed += 1;
    }
  }

  // 4. Downloads — thrown faults ⇒ failed (continue).
  for (const id of toDownload) {
    try {
      const ok = await downloadBlob(id, opDeps);
      if (ok) downloaded += 1;
    } catch {
      failed += 1;
    }
  }

  return { uploaded, downloaded, deferred, failed };
}
