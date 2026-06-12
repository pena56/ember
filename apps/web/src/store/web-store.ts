import type { Document, FlushedSession, Hasher, ReadingPosition, ReadingSession } from '@ember/core';
import type { BlobStore, ImportResult, Repository } from '@ember/store';
import { getReadingPosition, importDocument, listDocuments, listReadingPositions, recordSession, saveReadingPosition } from '@ember/store';

import type { WebClock } from './web-clock.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WebStore {
  importPdf(file: File): Promise<ImportResult>;
  listDocuments(): Promise<Document[]>;
  /** Read back the raw PDF bytes for a stored document by id. Returns undefined when the blob is not found. */
  getPdfBytes(id: string): Promise<Uint8Array | undefined>;
  /** Upsert the current reading position for a document (last-write). */
  saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition>;
  /** Return the stored reading position for a document, or undefined if none saved. */
  getReadingPosition(docId: string): Promise<ReadingPosition | undefined>;
  /** Return all saved reading positions (unsorted — sort/join is a UI concern). */
  listReadingPositions(): Promise<ReadingPosition[]>;
  /** Append one immutable ReadingSession + one outbox entry. */
  recordSession(flushed: FlushedSession): Promise<ReadingSession>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Compose the injected platform capabilities into the WebStore surface.
 *
 * All deps are injectable so tests can pass MemoryRepository + MemoryBlobStore
 * + subtleCryptoHasher + a createWebClock over in-memory storage. Production
 * builds the real DexieRepository + OpfsBlobStore + createWebClock().
 */
export function createWebStore(deps: {
  repo: Repository;
  blobs: BlobStore;
  hasher: Hasher;
  clock: WebClock;
}): WebStore {
  const { repo, blobs, hasher, clock } = deps;

  return {
    async importPdf(file: File): Promise<ImportResult> {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      return importDocument(
        {
          repo,
          blobs,
          hasher,
          newOutboxId: () => clock.newOutboxId(),
          hlc: clock.nextStamp(),
          now: clock.now(),
        },
        {
          bytes,
          filename: file.name,
          contentType: 'application/pdf',
        },
      );
    },

    async listDocuments(): Promise<Document[]> {
      const docs = await listDocuments(repo);
      // Recently-added-first: sort descending by importedAt
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

    async listReadingPositions(): Promise<ReadingPosition[]> {
      return listReadingPositions(repo);
    },

    async recordSession(flushed: FlushedSession): Promise<ReadingSession> {
      return recordSession(
        { repo, newId: () => clock.newId(), newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        flushed,
      );
    },
  };
}
