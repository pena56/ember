// annotations use-cases — platform-agnostic, mutable (create/edit/delete).
// Unlike sessions (append-only), annotations have update + delete paths.
// Caller supplies repo, hlc, newOutboxId so store stays platform-free.

import {
  type Annotation,
  type Hlc,
  makeOutboxEntry,
} from '@ember/core';

import type { Repository } from './repository.js';

export const ANNOTATIONS_COLLECTION = 'annotations';

/**
 * Upsert an annotation and enqueue exactly one HLC-stamped outbox entry.
 * Serves both create and edit: the caller builds/edits via
 * `makeAnnotation`/`editAnnotation` upstream before calling this.
 * Writes exactly one record + one outbox entry per call (invariant #2).
 */
export async function saveAnnotation(
  deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string },
  annotation: Annotation,
): Promise<Annotation> {
  await deps.repo.put(ANNOTATIONS_COLLECTION, annotation);

  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: ANNOTATIONS_COLLECTION,
      recordId: annotation.id,
      op: 'put',
      payload: annotation,
    }),
  );

  return annotation;
}

/**
 * Delete an annotation by id and enqueue exactly one tombstone outbox entry.
 * Idempotent at the repo layer (delete of absent id is a no-op pass-through).
 * Still enqueues the tombstone so the delete propagates via sync (invariant #2).
 */
export async function deleteAnnotation(
  deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string },
  id: string,
): Promise<void> {
  await deps.repo.delete(ANNOTATIONS_COLLECTION, id);

  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: ANNOTATIONS_COLLECTION,
      recordId: id,
      op: 'delete',
    }),
  );
}

/**
 * Return all saved annotations, optionally filtered by docId.
 * Ordering is a UI concern (10b/10c sort by `createdAt`).
 */
export async function listAnnotations(
  repo: Repository,
  docId?: string,
): Promise<Annotation[]> {
  if (docId === undefined) {
    return repo.query<Annotation>(ANNOTATIONS_COLLECTION);
  }
  return repo.query<Annotation>(ANNOTATIONS_COLLECTION, (rec) => rec.docId === docId);
}
