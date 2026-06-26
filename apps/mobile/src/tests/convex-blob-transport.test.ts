/**
 * convex-blob-transport.test.ts — BlobTransport backed by a fake Convex client.
 *
 * Verifies:
 *  (1) upload: calls generateUploadUrl, POSTs ciphertext, returns storageId (stays local).
 *  (2) saveBlob: passes SaveBlobResult union straight through.
 *  (3) download null-skip: when getDownloadUrl returns null, download returns null.
 *  (4) download: when URL exists, fetch is called and ArrayBuffer returned.
 *  (5) deleteBlob: calls mutation with correct args.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SaveBlobResult } from '@ember/core';

import { createConvexBlobTransport } from '../sync/convex-blob-transport.js';

// ── Fakes ──────────────────────────────────────────────────────────────────────

function makeFakeClient(overrides?: {
  mutationResponses?: Record<string, unknown>;
  queryResponses?: Record<string, unknown>;
}) {
  const mutations: { ref: unknown; args?: unknown }[] = [];
  const queries: { ref: unknown; args?: unknown }[] = [];

  const mutationResponses = overrides?.mutationResponses ?? {};
  const queryResponses = overrides?.queryResponses ?? {};

  return {
    mutations,
    queries,
    client: {
      mutation: vi.fn().mockImplementation((ref: unknown, args?: unknown) => {
        mutations.push({ ref, args });
        const key = String(ref);
        return Promise.resolve(mutationResponses[key] ?? undefined);
      }),
      query: vi.fn().mockImplementation((ref: unknown, args?: unknown) => {
        queries.push({ ref, args });
        const key = String(ref);
        return Promise.resolve(queryResponses[key] ?? undefined);
      }),
    },
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('createConvexBlobTransport', () => {
  it('(1) upload: calls generateUploadUrl mutation, POSTs ciphertext, returns storageId (never exposes URL)', async () => {
    const uploadUrl = 'https://example.com/upload';
    const storageId = 'storage-abc-123';
    const ciphertext = new Uint8Array([1, 2, 3, 4]);

    // Mock fetch globally
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ storageId }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { client } = makeFakeClient({
      mutationResponses: { 'function files/generateUploadUrl': uploadUrl },
    });

    // We need the actual api ref, but since we mock the client.mutation response by position,
    // we just check that mutation was called and fetch was called with the right method.
    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);

    // Patch the mutation to return our upload URL for the first call.
    (client.mutation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(uploadUrl);

    const result = await transport.upload(ciphertext);

    // The storageId is returned — that's the only value that leaves the binding.
    expect(result).toEqual({ storageId });

    // fetch was called with POST + the upload URL
    expect(fetchMock).toHaveBeenCalledWith(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: ciphertext,
    });
  });

  it('(2a) saveBlob: passes ok:true through', async () => {
    const { client } = makeFakeClient();
    const okResult: SaveBlobResult = { ok: true };
    (client.mutation as ReturnType<typeof vi.fn>).mockResolvedValue(okResult);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    const result = await transport.saveBlob('content-1', 'storage-1');

    expect(result).toEqual(okResult);
  });

  it('(2b) saveBlob: passes ok:false over-file-cap through', async () => {
    const { client } = makeFakeClient();
    const limitResult: SaveBlobResult = { ok: false, code: 'over-file-cap', limit: 50_000_000, attempted: 60_000_000 };
    (client.mutation as ReturnType<typeof vi.fn>).mockResolvedValue(limitResult);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    const result = await transport.saveBlob('content-2', 'storage-2');

    expect(result).toEqual(limitResult);
  });

  it('(2c) saveBlob: passes ok:false over-quota through', async () => {
    const { client } = makeFakeClient();
    const quotaResult: SaveBlobResult = { ok: false, code: 'over-quota', limit: 1_000_000_000, used: 999_999_999, attempted: 10_000_000 };
    (client.mutation as ReturnType<typeof vi.fn>).mockResolvedValue(quotaResult);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    const result = await transport.saveBlob('content-3', 'storage-3');

    expect(result).toEqual(quotaResult);
  });

  it('(3) download: returns null when getDownloadUrl returns null', async () => {
    const { client } = makeFakeClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    const result = await transport.download('no-such-content');

    expect(result).toBeNull();
  });

  it('(3b) download: returns null when getDownloadUrl returns undefined', async () => {
    const { client } = makeFakeClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    const result = await transport.download('no-such-content');

    expect(result).toBeNull();
  });

  it('(4) download: fetches ciphertext from URL (URL stays in binding), returns Uint8Array', async () => {
    const downloadUrl = 'https://example.com/download/abc';
    const rawBytes = new Uint8Array([9, 8, 7]).buffer;

    const fetchMock = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(rawBytes),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { client } = makeFakeClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue(downloadUrl);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    const result = await transport.download('content-x');

    expect(result).toEqual(new Uint8Array(rawBytes));
    // fetch was called with the URL — the URL itself never leaves the transport
    expect(fetchMock).toHaveBeenCalledWith(downloadUrl);
  });

  it('(5) deleteBlob: calls mutation with correct contentId', async () => {
    const { client } = makeFakeClient();
    (client.mutation as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const transport = createConvexBlobTransport(client as unknown as Parameters<typeof createConvexBlobTransport>[0]);
    await transport.deleteBlob('content-del');

    // mutation was called once with the deleteBlob args
    expect(client.mutation).toHaveBeenCalledTimes(1);
    // Second arg should include contentId
    const callArgs = (client.mutation as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, unknown];
    expect(callArgs[1]).toEqual({ contentId: 'content-del' });
  });
});
