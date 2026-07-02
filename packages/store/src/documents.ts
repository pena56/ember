// importDocument use-case + listDocuments query — platform-agnostic.
// Caller supplies all platform capabilities (hasher, now, newOutboxId, hlc).

import {
  type Annotation,
  type DocTag,
  type Hasher,
  type Hlc,
  type Document,
  type ReadingPosition,
  DOC_TAGS_COLLECTION,
  computeDocumentId,
  makeDocument,
  makeOutboxEntry,
  withDocumentPageCount,
} from '@ember/core';

import { ANNOTATIONS_COLLECTION } from './annotations.js';
import type { BlobStore } from './blob-store.js';
import { READING_POSITIONS_COLLECTION } from './reading-positions.js';
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

/**
 * Delete a document and cascade to its owned records.
 *
 * Removes, each as a repo.delete + one HLC-stamped delete tombstone (invariant #2,
 * following the deleteTag / deleteAnnotation pattern):
 *   - the document record            (DOCUMENTS_COLLECTION)
 *   - every tag link for the doc      (DOC_TAGS_COLLECTION)
 *   - the reading position, if any    (READING_POSITIONS_COLLECTION; id === docId)
 *   - every annotation on the doc     (ANNOTATIONS_COLLECTION)
 * …then deletes the local file bytes (blobs.delete) to free storage.
 *
 * Reading SESSIONS are intentionally NOT deleted: they are immutable/append-only
 * (invariant #3 — no delete path) and carry streak/stats history that must survive
 * a file being removed.
 *
 * Each tombstone gets its own fresh stamp + outbox id (nextStamp / newOutboxId are
 * called per record) so ordering stays monotonic and every entry is unique.
 * Deleting a document with no owned records still tombstones the document itself.
 */
export async function deleteDocument(
  deps: {
    repo: Repository;
    blobs: BlobStore;
    newOutboxId: () => string;
    nextStamp: () => Hlc;
  },
  docId: string,
): Promise<void> {
  const [docTags, annotations, position] = await Promise.all([
    deps.repo.query<DocTag>(DOC_TAGS_COLLECTION, (r) => r.documentId === docId),
    deps.repo.query<Annotation>(ANNOTATIONS_COLLECTION, (r) => r.docId === docId),
    deps.repo.get<ReadingPosition>(READING_POSITIONS_COLLECTION, docId),
  ]);

  // Ordered so the document tombstone lands first, then its dependents.
  const targets: { collection: string; recordId: string }[] = [
    { collection: DOCUMENTS_COLLECTION, recordId: docId },
    ...docTags.map((t) => ({ collection: DOC_TAGS_COLLECTION, recordId: t.id })),
    ...annotations.map((a) => ({ collection: ANNOTATIONS_COLLECTION, recordId: a.id })),
    ...(position !== undefined
      ? [{ collection: READING_POSITIONS_COLLECTION, recordId: docId }]
      : []),
  ];

  for (const { collection, recordId } of targets) {
    await deps.repo.delete(collection, recordId);
    await deps.repo.enqueue(
      makeOutboxEntry({
        id: deps.newOutboxId(),
        hlc: deps.nextStamp(),
        collection,
        recordId,
        op: 'delete',
      }),
    );
  }

  // Free the local bytes last — record tombstones are the source of truth for sync.
  await deps.blobs.delete(docId);
}
