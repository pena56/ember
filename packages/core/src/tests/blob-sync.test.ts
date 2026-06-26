/**
 * Tests for the core blob-sync engine (Unit 13b).
 * All fakes are local — NO @ember/store / convex / platform import.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  BLOB_SYNC_COLLECTION,
  downloadBlob,
  forgetBlob,
  planBlobSync,
  reconcileBlobs,
  uploadBlob,
} from '../blob-sync.js';
import type {
  BlobBytes,
  BlobStatus,
  BlobStatusStore,
  BlobTransport,
  CryptoBox,
  SaveBlobResult,
} from '../blob-sync.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Identity/XOR CryptoBox — round-trips bytes so decrypt(encrypt(x)) === x. */
function makeFakeCrypto(mask = 0x5a): CryptoBox & { encryptCalls: number; decryptCalls: number } {
  const xor = (b: Uint8Array) => b.map((x) => x ^ mask);
  const box = {
    encryptCalls: 0,
    decryptCalls: 0,
    async encrypt(plaintext: Uint8Array) {
      box.encryptCalls += 1;
      return xor(plaintext);
    },
    async decrypt(ciphertext: Uint8Array) {
      box.decryptCalls += 1;
      return xor(ciphertext);
    },
  };
  return box;
}

/** Map-backed BlobBytes. */
function makeFakeBlobs(seed: Record<string, Uint8Array> = {}): BlobBytes & {
  _data: Map<string, Uint8Array>;
} {
  const _data = new Map<string, Uint8Array>(Object.entries(seed));
  return {
    _data,
    async has(id) {
      return _data.has(id);
    },
    async get(id) {
      return _data.get(id);
    },
    async put(id, bytes) {
      _data.set(id, bytes);
    },
  };
}

/** Map-backed BlobStatusStore (collection-keyed, mirrors SyncStore subset). */
function makeFakeStatus(): BlobStatusStore & { _data: Map<string, Map<string, unknown>> } {
  const _data = new Map<string, Map<string, unknown>>();
  const coll = (c: string) => {
    if (!_data.has(c)) _data.set(c, new Map());
    return _data.get(c)!;
  };
  return {
    _data,
    async get<T extends { id: string }>(collection: string, id: string) {
      return coll(collection).get(id) as T | undefined;
    },
    async put<T extends { id: string }>(collection: string, record: T) {
      coll(collection).set(record.id, record);
    },
    async delete(collection: string, id: string) {
      coll(collection).delete(id);
    },
  };
}

/** Fake transport with canned saveBlob results and recorded calls. */
function makeFakeTransport(opts?: {
  saveResult?: SaveBlobResult | ((contentId: string) => SaveBlobResult);
  downloadMap?: Record<string, Uint8Array | null>;
}): BlobTransport & {
  uploads: Uint8Array[];
  saved: Array<{ contentId: string; storageId: string }>;
  deleted: string[];
} {
  let counter = 0;
  const uploads: Uint8Array[] = [];
  const saved: Array<{ contentId: string; storageId: string }> = [];
  const deleted: string[] = [];
  const downloadMap = opts?.downloadMap ?? {};
  return {
    uploads,
    saved,
    deleted,
    async upload(ciphertext) {
      uploads.push(ciphertext);
      return { storageId: `sid-${++counter}` };
    },
    async saveBlob(contentId, storageId) {
      saved.push({ contentId, storageId });
      const r = opts?.saveResult ?? { ok: true };
      return typeof r === 'function' ? r(contentId) : r;
    },
    async download(contentId) {
      return contentId in downloadMap ? downloadMap[contentId]! : null;
    },
    async deleteBlob(contentId) {
      deleted.push(contentId);
    },
  };
}

const bytes = (...xs: number[]) => new Uint8Array(xs);

// ---------------------------------------------------------------------------
// planBlobSync
// ---------------------------------------------------------------------------

describe('planBlobSync', () => {
  const noStatus = () => undefined;

  it('nothing synced → empty partition', () => {
    const plan = planBlobSync({ syncedIds: [], localIds: new Set(), statusOf: noStatus });
    expect(plan).toEqual({ toUpload: [], toDownload: [] });
  });

  it('local-but-not-uploaded → toUpload', () => {
    const plan = planBlobSync({
      syncedIds: ['a', 'b'],
      localIds: new Set(['a', 'b']),
      statusOf: noStatus,
    });
    expect(plan.toUpload).toEqual(['a', 'b']);
    expect(plan.toDownload).toEqual([]);
  });

  it('synced-but-not-local → toDownload', () => {
    const plan = planBlobSync({
      syncedIds: ['a', 'b'],
      localIds: new Set(),
      statusOf: noStatus,
    });
    expect(plan.toDownload).toEqual(['a', 'b']);
    expect(plan.toUpload).toEqual([]);
  });

  it('already synced → skipped both ways', () => {
    const statusOf = (id: string): BlobStatus | undefined =>
      id === 'a' ? { id: 'a', status: 'synced' } : undefined;
    const plan = planBlobSync({
      syncedIds: ['a'],
      localIds: new Set(['a']),
      statusOf,
    });
    expect(plan).toEqual({ toUpload: [], toDownload: [] });
  });

  it('deferred excluded unless retryDeferred', () => {
    const statusOf = (id: string): BlobStatus | undefined =>
      id === 'a' ? { id: 'a', status: 'deferred', code: 'over-quota' } : undefined;

    const without = planBlobSync({ syncedIds: ['a'], localIds: new Set(['a']), statusOf });
    expect(without.toUpload).toEqual([]);

    const withRetry = planBlobSync({
      syncedIds: ['a'],
      localIds: new Set(['a']),
      statusOf,
      retryDeferred: true,
    });
    expect(withRetry.toUpload).toEqual(['a']);
  });

  it('dedupes upload ids and keeps stable order', () => {
    const plan = planBlobSync({
      syncedIds: ['b', 'a', 'b', 'a'],
      localIds: new Set(['a', 'b']),
      statusOf: noStatus,
    });
    expect(plan.toUpload).toEqual(['b', 'a']);
  });
});

// ---------------------------------------------------------------------------
// uploadBlob
// ---------------------------------------------------------------------------

describe('uploadBlob', () => {
  it('encrypts then upload→saveBlob; ok:true marks synced', async () => {
    const blobs = makeFakeBlobs({ x: bytes(1, 2, 3) });
    const transport = makeFakeTransport({ saveResult: { ok: true } });
    const crypto = makeFakeCrypto();
    const status = makeFakeStatus();

    const res = await uploadBlob('x', { blobs, transport, crypto, status });

    expect(res).toEqual({ ok: true });
    expect(crypto.encryptCalls).toBe(1);
    expect(transport.uploads).toHaveLength(1);
    // ciphertext is the encrypted form, not the plaintext
    expect(transport.uploads[0]).not.toEqual(bytes(1, 2, 3));
    expect(transport.saved).toEqual([{ contentId: 'x', storageId: 'sid-1' }]);
    const rec = await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'x');
    expect(rec).toEqual({ id: 'x', status: 'synced' });
  });

  for (const code of ['over-file-cap', 'over-quota'] as const) {
    it(`reject ${code} → deferred with code, returns union without throwing`, async () => {
      const blobs = makeFakeBlobs({ x: bytes(9) });
      const reject =
        code === 'over-file-cap'
          ? ({ ok: false, code, limit: 50, attempted: 99 } as const)
          : ({ ok: false, code, limit: 100, used: 80, attempted: 30 } as const);
      const transport = makeFakeTransport({ saveResult: reject });
      const status = makeFakeStatus();

      const res = await uploadBlob('x', { blobs, transport, crypto: makeFakeCrypto(), status });

      expect(res).toEqual(reject);
      const rec = await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'x');
      expect(rec).toEqual({ id: 'x', status: 'deferred', code });
    });
  }

  it('missing-upload reject from server → deferred', async () => {
    const blobs = makeFakeBlobs({ x: bytes(9) });
    const transport = makeFakeTransport({ saveResult: { ok: false, code: 'missing-upload' } });
    const status = makeFakeStatus();
    const res = await uploadBlob('x', { blobs, transport, crypto: makeFakeCrypto(), status });
    expect(res).toEqual({ ok: false, code: 'missing-upload' });
    const rec = await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'x');
    expect(rec).toEqual({ id: 'x', status: 'deferred', code: 'missing-upload' });
  });

  it('no local bytes → { ok:false, missing-upload }, never touches transport', async () => {
    const blobs = makeFakeBlobs();
    const transport = makeFakeTransport();
    const status = makeFakeStatus();
    const res = await uploadBlob('gone', { blobs, transport, crypto: makeFakeCrypto(), status });
    expect(res).toEqual({ ok: false, code: 'missing-upload' });
    expect(transport.uploads).toHaveLength(0);
    expect(transport.saved).toHaveLength(0);
    // No bytes to send ⇒ nothing to defer: status must stay unwritten so a later import
    // of these bytes still uploads on a default (non-retry) cycle.
    expect(await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'gone')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// downloadBlob
// ---------------------------------------------------------------------------

describe('downloadBlob', () => {
  it('null from transport → false, no write', async () => {
    const blobs = makeFakeBlobs();
    const transport = makeFakeTransport({ downloadMap: {} });
    const status = makeFakeStatus();
    const ok = await downloadBlob('x', { blobs, transport, crypto: makeFakeCrypto(), status });
    expect(ok).toBe(false);
    expect(blobs._data.has('x')).toBe(false);
    expect(await status.get(BLOB_SYNC_COLLECTION, 'x')).toBeUndefined();
  });

  it('decrypts, puts plaintext, marks synced, returns true; round-trip preserved', async () => {
    const crypto = makeFakeCrypto();
    const plaintext = bytes(7, 8, 9);
    const ciphertext = await crypto.encrypt(plaintext); // what the server holds
    const blobs = makeFakeBlobs();
    const transport = makeFakeTransport({ downloadMap: { x: ciphertext } });
    const status = makeFakeStatus();

    const ok = await downloadBlob('x', { blobs, transport, crypto, status });

    expect(ok).toBe(true);
    expect(blobs._data.get('x')).toEqual(plaintext); // decrypt(encrypt(x)) === x
    expect(await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'x')).toEqual({
      id: 'x',
      status: 'synced',
    });
  });
});

// ---------------------------------------------------------------------------
// forgetBlob
// ---------------------------------------------------------------------------

describe('forgetBlob', () => {
  it('deletes server blob, clears status, idempotent', async () => {
    const transport = makeFakeTransport();
    const status = makeFakeStatus();
    await status.put<BlobStatus>(BLOB_SYNC_COLLECTION, { id: 'x', status: 'synced' });

    await forgetBlob('x', { transport, status });
    expect(transport.deleted).toEqual(['x']);
    expect(await status.get(BLOB_SYNC_COLLECTION, 'x')).toBeUndefined();

    // Second call — no-op (status already gone, deleteBlob idempotent on the server)
    await forgetBlob('x', { transport, status });
    expect(transport.deleted).toEqual(['x', 'x']);
    expect(await status.get(BLOB_SYNC_COLLECTION, 'x')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// reconcileBlobs
// ---------------------------------------------------------------------------

describe('reconcileBlobs', () => {
  it('end-to-end: uploads pending, downloads missing, tallies', async () => {
    const crypto = makeFakeCrypto();
    const downCipher = await crypto.encrypt(bytes(4, 4));
    const blobs = makeFakeBlobs({ up1: bytes(1), up2: bytes(2) });
    const transport = makeFakeTransport({
      saveResult: { ok: true },
      downloadMap: { down1: downCipher },
    });
    const status = makeFakeStatus();

    const report = await reconcileBlobs({
      candidateIds: ['up1', 'up2', 'down1'],
      blobs,
      transport,
      crypto,
      status,
    });

    expect(report).toEqual({ uploaded: 2, downloaded: 1, deferred: 0, failed: 0 });
    expect(blobs._data.get('down1')).toEqual(bytes(4, 4));
  });

  it('limit reject ⇒ deferred (not failed); rest continue', async () => {
    const blobs = makeFakeBlobs({ ok1: bytes(1), big: bytes(2) });
    const transport = makeFakeTransport({
      saveResult: (id) =>
        id === 'big'
          ? { ok: false, code: 'over-file-cap', limit: 1, attempted: 99 }
          : { ok: true },
    });
    const status = makeFakeStatus();

    const report = await reconcileBlobs({
      candidateIds: ['ok1', 'big'],
      blobs,
      transport,
      crypto: makeFakeCrypto(),
      status,
    });

    expect(report).toEqual({ uploaded: 1, downloaded: 0, deferred: 1, failed: 0 });
    expect(await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'big')).toEqual({
      id: 'big',
      status: 'deferred',
      code: 'over-file-cap',
    });
  });

  it('network fault on one blob ⇒ failed, does not abort the batch', async () => {
    const blobs = makeFakeBlobs({ a: bytes(1), b: bytes(2), c: bytes(3) });
    const transport = makeFakeTransport({ saveResult: { ok: true } });
    // Make saveBlob of 'b' throw (genuine I/O fault); a and c succeed.
    transport.saveBlob = vi.fn(async (contentId: string, storageId: string) => {
      if (contentId === 'b') throw new Error('network down');
      transport.saved.push({ contentId, storageId });
      return { ok: true } as SaveBlobResult;
    }) as typeof transport.saveBlob;

    const status = makeFakeStatus();
    const report = await reconcileBlobs({
      candidateIds: ['a', 'b', 'c'],
      blobs,
      transport,
      crypto: makeFakeCrypto(),
      status,
    });

    expect(report.failed).toBe(1);
    expect(report.uploaded).toBe(2); // a and c still uploaded
    // b left untouched (no status written)
    expect(await status.get(BLOB_SYNC_COLLECTION, 'b')).toBeUndefined();
    expect(await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'a')).toEqual({
      id: 'a',
      status: 'synced',
    });
  });

  it('download fault ⇒ failed, continues', async () => {
    const blobs = makeFakeBlobs();
    const transport = makeFakeTransport();
    transport.download = vi.fn(async (contentId: string) => {
      if (contentId === 'd1') throw new Error('fetch failed');
      return null;
    }) as typeof transport.download;
    const status = makeFakeStatus();

    const report = await reconcileBlobs({
      candidateIds: ['d1', 'd2'],
      blobs,
      transport,
      crypto: makeFakeCrypto(),
      status,
    });

    expect(report.failed).toBe(1);
    expect(report.downloaded).toBe(0);
  });

  it('retryDeferred re-attempts a previously deferred blob', async () => {
    const blobs = makeFakeBlobs({ x: bytes(1) });
    const status = makeFakeStatus();
    await status.put<BlobStatus>(BLOB_SYNC_COLLECTION, {
      id: 'x',
      status: 'deferred',
      code: 'over-quota',
    });
    const transport = makeFakeTransport({ saveResult: { ok: true } });

    const noRetry = await reconcileBlobs({
      candidateIds: ['x'],
      blobs,
      transport,
      crypto: makeFakeCrypto(),
      status,
    });
    expect(noRetry).toEqual({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });

    const withRetry = await reconcileBlobs({
      candidateIds: ['x'],
      blobs,
      transport,
      crypto: makeFakeCrypto(),
      status,
      retryDeferred: true,
    });
    expect(withRetry.uploaded).toBe(1);
    expect(await status.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'x')).toEqual({
      id: 'x',
      status: 'synced',
    });
  });
});
