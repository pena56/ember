// In-memory reference implementation of BlobStore.
// Map-backed; copies bytes in/out for value isolation. Mirrors MemoryRepository.

import type { BlobStore } from './blob-store.js';

export class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async put(id: string, bytes: Uint8Array): Promise<void> {
    // Copy on write so caller mutations don't affect stored state.
    this.blobs.set(id, bytes.slice());
  }

  async get(id: string): Promise<Uint8Array | undefined> {
    const stored = this.blobs.get(id);
    if (!stored) return undefined;
    // Copy on read so mutations to the returned buffer don't affect the store.
    return stored.slice();
  }

  async has(id: string): Promise<boolean> {
    return this.blobs.has(id);
  }

  async delete(id: string): Promise<void> {
    this.blobs.delete(id);
  }

  async close(): Promise<void> {
    // No resources to release for the in-memory impl.
  }
}
