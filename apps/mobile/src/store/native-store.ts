import type { Document, Hasher } from '@ember/core';
import type { BlobStore, ImportResult, Repository } from '@ember/store';
import { importDocument, listDocuments } from '@ember/store';

import type { NativeClock } from './native-clock.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NativeStore {
  /**
   * Import a PDF from raw bytes.
   *
   * The bytes are already read by the caller (pick-pdf.ts), keeping this
   * composition layer pure (no native file-system or picker dependency).
   */
  importPdf(bytes: Uint8Array, filename: string, contentType?: string): Promise<ImportResult>;
  /** Return all documents, sorted recently-added-first. */
  listDocuments(): Promise<Document[]>;
  /**
   * Read back the raw PDF bytes for a stored document.
   *
   * Returns `undefined` if no blob exists for the given id (e.g. missing or
   * never imported). Mirror of web-store's `getPdfBytes` (05a).
   */
  getPdfBytes(id: string): Promise<Uint8Array | undefined>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Compose injected platform capabilities into the NativeStore surface.
 *
 * All deps are injectable so tests can pass MemoryRepository + MemoryBlobStore
 * + a fake Hasher + createNativeClock over in-memory storage. Production wires
 * up SqliteRepository + ExpoFileSystemBlobStore + expoCryptoHasher + createNativeClock().
 */
export function createNativeStore(deps: {
  repo: Repository;
  blobs: BlobStore;
  hasher: Hasher;
  clock: NativeClock;
}): NativeStore {
  const { repo, blobs, hasher, clock } = deps;

  return {
    async importPdf(bytes, filename, contentType = 'application/pdf'): Promise<ImportResult> {
      return importDocument(
        {
          repo,
          blobs,
          hasher,
          newOutboxId: () => clock.newOutboxId(),
          hlc: clock.nextStamp(),
          now: clock.now(),
        },
        { bytes, filename, contentType },
      );
    },

    async listDocuments(): Promise<Document[]> {
      const docs = await listDocuments(repo);
      // Recently-added-first: sort descending by importedAt (UI concern)
      return [...docs].sort((a, b) => b.importedAt - a.importedAt);
    },

    async getPdfBytes(id: string): Promise<Uint8Array | undefined> {
      return blobs.get(id);
    },
  };
}
