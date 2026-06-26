/**
 * convex-blob-transport.test.ts — BlobTransport backed by Convex.
 *
 * Tests (fake client + mocked global.fetch):
 *  (1) upload: calls generateUploadUrl, POSTs ciphertext, returns { storageId }
 *  (2) saveBlob: passes SaveBlobResult union straight through (ok + each reject code)
 *  (3) download: returns null when getDownloadUrl returns null; else fetches bytes
 *  (4) deleteBlob: calls the deleteBlob mutation with contentId
 */

import type { ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@ember/convex/_generated/api';
import type { SaveBlobResult } from '@ember/core';

import { createConvexBlobTransport } from '../sync/convex-blob-transport.js';

// ── Fake client ────────────────────────────────────────────────────────────────

function fakeClient(over: {
  mutation?: ReturnType<typeof vi.fn>;
  query?: ReturnType<typeof vi.fn>;
}): ConvexReactClient {
  return {
    mutation: over.mutation ?? vi.fn(),
    query: over.query ?? vi.fn(),
  } as unknown as ConvexReactClient;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createConvexBlobTransport', () => {
  it('(1) upload: generates upload URL, POSTs ciphertext as octet-stream, returns storageId', async () => {
    const uploadUrl = 'https://storage.example.com/upload/abc';
    const storageId = 'ks7f3abc';

    const mutation = vi.fn().mockResolvedValue(uploadUrl);
    const transport = createConvexBlobTransport(fakeClient({ mutation }));

    // Mock fetch to return { storageId }
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ storageId }),
    } as unknown as Response);

    const ciphertext = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await transport.upload(ciphertext);

    // generateUploadUrl was called
    expect(mutation).toHaveBeenCalledWith(api.files.generateUploadUrl);

    // fetch was called with the upload URL + correct headers + body
    expect(global.fetch).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/octet-stream' }),
        body: ciphertext,
      }),
    );

    expect(result).toEqual({ storageId });
  });

  it('(2a) saveBlob: passes { ok: true } straight through', async () => {
    const saveBlobResult: SaveBlobResult = { ok: true };
    const mutation = vi.fn().mockResolvedValue(saveBlobResult);
    const transport = createConvexBlobTransport(fakeClient({ mutation }));

    const result = await transport.saveBlob('content-1', 'storage-1');

    expect(mutation).toHaveBeenCalledWith(api.files.saveBlob, {
      contentId: 'content-1',
      storageId: 'storage-1',
    });
    expect(result).toEqual({ ok: true });
  });

  it('(2b) saveBlob: passes over-file-cap rejection straight through', async () => {
    const saveBlobResult: SaveBlobResult = {
      ok: false,
      code: 'over-file-cap',
      limit: 52428800,
      attempted: 60000000,
    };
    const mutation = vi.fn().mockResolvedValue(saveBlobResult);
    const transport = createConvexBlobTransport(fakeClient({ mutation }));

    const result = await transport.saveBlob('content-2', 'storage-2');
    expect(result).toEqual(saveBlobResult);
  });

  it('(2c) saveBlob: passes over-quota rejection straight through', async () => {
    const saveBlobResult: SaveBlobResult = {
      ok: false,
      code: 'over-quota',
      limit: 1073741824,
      used: 900000000,
      attempted: 40000000,
    };
    const mutation = vi.fn().mockResolvedValue(saveBlobResult);
    const transport = createConvexBlobTransport(fakeClient({ mutation }));

    const result = await transport.saveBlob('content-3', 'storage-3');
    expect(result).toEqual(saveBlobResult);
  });

  it('(3a) download: returns null when getDownloadUrl returns null', async () => {
    const query = vi.fn().mockResolvedValue(null);
    const transport = createConvexBlobTransport(fakeClient({ query }));

    global.fetch = vi.fn();

    const result = await transport.download('content-missing');

    expect(query).toHaveBeenCalledWith(api.files.getDownloadUrl, { contentId: 'content-missing' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('(3b) download: fetches bytes from URL and returns Uint8Array when URL is present', async () => {
    const downloadUrl = 'https://storage.example.com/blob/xyz';
    const bytes = new Uint8Array([10, 20, 30]);

    const query = vi.fn().mockResolvedValue(downloadUrl);
    const transport = createConvexBlobTransport(fakeClient({ query }));

    global.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
    } as unknown as Response);

    const result = await transport.download('content-exists');

    expect(global.fetch).toHaveBeenCalledWith(downloadUrl);
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual(Array.from(bytes));
  });

  it('(4) deleteBlob: calls the deleteBlob mutation with contentId', async () => {
    const mutation = vi.fn().mockResolvedValue(undefined);
    const transport = createConvexBlobTransport(fakeClient({ mutation }));

    await transport.deleteBlob('content-to-delete');

    expect(mutation).toHaveBeenCalledWith(api.files.deleteBlob, {
      contentId: 'content-to-delete',
    });
  });
});
