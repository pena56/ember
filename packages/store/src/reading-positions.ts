// saveReadingPosition / getReadingPosition / listReadingPositions use-cases — platform-agnostic.
// Caller supplies repo, newOutboxId, and hlc so core/store stay platform-free.

import { type Hlc, type ReadingPosition, makeOutboxEntry, makeReadingPosition } from '@ember/core';

import type { Repository } from './repository.js';

export const READING_POSITIONS_COLLECTION = 'reading-positions';

/**
 * Upsert the current reading position for a document.
 *
 * Local save is **last-write** (not furthest-page): re-saving a lower page replaces the stored
 * record so the reader resumes where you actually left off. `mergeReadingPosition` (furthest-page)
 * runs only at reconcile (unit 12), not here.
 *
 * Writes exactly one ReadingPosition record + one HLC-stamped outbox entry per call (invariant #2).
 * Throttling is a UI concern (06b/06c).
 */
export async function saveReadingPosition(
  deps: { repo: Repository; newOutboxId: () => string; hlc: Hlc },
  input: { docId: string; page: number; offset: number },
): Promise<ReadingPosition> {
  const pos = makeReadingPosition({
    id: input.docId,
    page: input.page,
    offset: input.offset,
    hlc: deps.hlc,
  });

  await deps.repo.put(READING_POSITIONS_COLLECTION, pos);

  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: READING_POSITIONS_COLLECTION,
      recordId: input.docId,
      op: 'put',
      payload: pos,
    }),
  );

  return pos;
}

/**
 * Return the stored reading position for a document, or undefined if none saved.
 * Used by the reader to resume playback position.
 */
export async function getReadingPosition(
  repo: Repository,
  docId: string,
): Promise<ReadingPosition | undefined> {
  return repo.get<ReadingPosition>(READING_POSITIONS_COLLECTION, docId);
}

/**
 * Return all saved reading positions as a flat list.
 * Sort/join-with-documents (Today's "Continue Reading") is a 06b/06c UI concern.
 */
export async function listReadingPositions(repo: Repository): Promise<ReadingPosition[]> {
  return repo.query<ReadingPosition>(READING_POSITIONS_COLLECTION);
}
