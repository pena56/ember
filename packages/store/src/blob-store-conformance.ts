// Shared behavioural conformance suite for BlobStore implementations.
// This file exports a function and runs NO tests on its own import.
// Test-only: imports vitest. NOT barrel-exported (Metro must never pull this module).
// 04b (OPFS) and 04c (expo-file-system) import via relative path.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BlobStore } from './blob-store.js';

export function runBlobStoreConformance(label: string, makeBlobs: () => BlobStore): void {
  describe(label, () => {
    let blobs: BlobStore;

    beforeEach(() => {
      blobs = makeBlobs();
    });

    afterEach(async () => {
      await blobs.close();
    });

    // --- put / get ---

    it('put→get round-trips bytes', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      await blobs.put('id1', bytes);
      const result = await blobs.get('id1');
      expect(result).toEqual(bytes);
    });

    it('get miss returns undefined', async () => {
      const result = await blobs.get('no-such-id');
      expect(result).toBeUndefined();
    });

    // --- has ---

    it('has returns true for a stored blob', async () => {
      await blobs.put('id1', new Uint8Array([10]));
      expect(await blobs.has('id1')).toBe(true);
    });

    it('has returns false for a missing blob', async () => {
      expect(await blobs.has('no-such-id')).toBe(false);
    });

    // --- overwrite ---

    it('put overwrites existing entry', async () => {
      await blobs.put('id1', new Uint8Array([1, 2, 3]));
      await blobs.put('id1', new Uint8Array([7, 8, 9]));
      const result = await blobs.get('id1');
      expect(result).toEqual(new Uint8Array([7, 8, 9]));
    });

    // --- delete ---

    it('delete removes the blob', async () => {
      await blobs.put('id1', new Uint8Array([1]));
      await blobs.delete('id1');
      expect(await blobs.get('id1')).toBeUndefined();
      expect(await blobs.has('id1')).toBe(false);
    });

    // --- value isolation ---

    it('mutating input bytes after put does not corrupt the store', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      await blobs.put('id1', bytes);
      bytes[0] = 255;
      const stored = await blobs.get('id1');
      expect(stored?.[0]).toBe(1);
    });

    it('mutating returned bytes from get does not corrupt the store', async () => {
      await blobs.put('id1', new Uint8Array([1, 2, 3]));
      const returned = await blobs.get('id1');
      if (returned) returned[0] = 255;
      const fresh = await blobs.get('id1');
      expect(fresh?.[0]).toBe(1);
    });

    // --- idempotent close ---

    it('close() is idempotent — calling it twice does not throw', async () => {
      // afterEach will call close() once; this call is the second.
      await expect(blobs.close()).resolves.not.toThrow();
    });
  });
}
