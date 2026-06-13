// importDocument use-case + listDocuments query — platform-agnostic.
// Caller supplies all platform capabilities (hasher, now, newOutboxId, hlc).

import {
  type Hasher,
  type Hlc,
  type Document,
  computeDocumentId,
  makeDocument,
  makeOutboxEntry,
  withDocumentPageCount,
} from '@ember/core';

import type { BlobStore } from './blob-store.js';
import type { Repository } from './repository.js';

export const DOCUMENTS_COLLECTION = 'documents';

export type ImportResult = {
  document: Document;
  deduped: boolean;
};

/**
 * Import a document by content-addressing its bytes.
 *
 * Steps:
 * 1. Hash bytes to derive the document id (SHA-256 hex).
 * 2. If a record already exists for that id → return it with deduped: true.
 *    No blob rewrite, no second outbox entry (invariant #2 not re-fired).
 * 3. Otherwise: persist record + blob + one HLC-stamped outbox entry.
 */
export async function importDocument(
  deps: {
    repo: Repository;
    blobs: BlobStore;
    hasher: Hasher;
    newOutboxId: () => string;
    hlc: Hlc;
    now: number;
  },
  input: {
    bytes: Uint8Array;
    filename: string;
    contentType: string;
    title?: string;
  },
): Promise<ImportResult> {
  const id = await computeDocumentId(input.bytes, deps.hasher);

  const existing = await deps.repo.get<Document>(DOCUMENTS_COLLECTION, id);
  if (existing) {
    return { document: existing, deduped: true };
  }

  const doc = makeDocument({
    id,
    filename: input.filename,
    byteSize: input.bytes.byteLength,
    contentType: input.contentType,
    importedAt: deps.now,
    ...(input.title !== undefined ? { title: input.title } : {}),
  });

  await deps.blobs.put(id, input.bytes);
  await deps.repo.put(DOCUMENTS_COLLECTION, doc);
  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: DOCUMENTS_COLLECTION,
      recordId: id,
      op: 'put',
      payload: doc,
    }),
  );

  return { document: doc, deduped: false };
}

/**
 * Return all imported documents as a flat list.
 * Sort/order is a UI concern (04b/04c).
 */
export async function listDocuments(repo: Repository): Promise<Document[]> {
  return repo.query<Document>(DOCUMENTS_COLLECTION);
}

/**
 * Set a document's total page count (write-once / idempotent).
 *
 * - Document not found            → return null, no write.
 * - Same count already stored      → return existing record, no write, no outbox entry.
 * - Otherwise                      → put updated record + exactly one HLC-stamped outbox entry.
 *
 * pageCount is intrinsic to the bytes (docId = sha256), so cross-device writes are value-identical;
 * no LWW tiebreak needed. Called by the reader (09b/09c) when pdfjs reports numPages.
 */
export async function setDocumentPageCount(
  deps: { repo: Repository; newOutboxId: () => string; hlc: Hlc },
  docId: string,
  pageCount: number,
): Promise<Document | null> {
  const existing = await deps.repo.get<Document>(DOCUMENTS_COLLECTION, docId);
  if (!existing) return null;
  if (existing.pageCount === pageCount) return existing; // idempotent no-op

  const updated = withDocumentPageCount(existing, pageCount);
  await deps.repo.put(DOCUMENTS_COLLECTION, updated);
  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: DOCUMENTS_COLLECTION,
      recordId: docId,
      op: 'put',
      payload: updated,
    }),
  );
  return updated;
}
