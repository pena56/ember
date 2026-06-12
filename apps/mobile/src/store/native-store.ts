import type { Document, Hasher, ReadingPosition } from '@ember/core';
import type { BlobStore, ImportResult, Repository } from '@ember/store';
import { getReadingPosition, importDocument, listDocuments, saveReadingPosition } from '@ember/store';

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
  /**
   * Upsert the current reading position for a document (last-write, not furthest).
   * Writes one ReadingPosition record + one HLC-stamped outbox entry (invariant #2).
   * Mirrors web-store's saveReadingPosition (06b).
   */
  saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition>;
  /**
   * Return the stored reading position for a document, or undefined if none saved.
   * Used by the reader to resume where the user left off.
   */
  getReadingPosition(docId: string): Promise<ReadingPosition | undefined>;
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

    async saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition> {
      return saveReadingPosition(
        { repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        input,
      );
    },

    async getReadingPosition(docId: string): Promise<ReadingPosition | undefined> {
      return getReadingPosition(repo, docId);
    },
  };
}
