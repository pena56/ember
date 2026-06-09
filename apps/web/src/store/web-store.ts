import type { Document, Hasher } from '@ember/core';
import type { BlobStore, ImportResult, Repository } from '@ember/store';
import { importDocument, listDocuments } from '@ember/store';

import type { WebClock } from './web-clock.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WebStore {
  importPdf(file: File): Promise<ImportResult>;
  listDocuments(): Promise<Document[]>;
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
  };
}
