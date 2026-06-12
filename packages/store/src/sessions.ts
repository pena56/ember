// recordSession / listSessions use-cases — platform-agnostic, append-only.
// Sessions are immutable (invariant #3): there is NO update/delete path.
// Caller supplies repo, newId, newOutboxId, and hlc so store stays platform-free.

import {
  type FlushedSession,
  type Hlc,
  type ReadingSession,
  makeOutboxEntry,
  makeReadingSession,
} from '@ember/core';

import type { Repository } from './repository.js';

export const SESSIONS_COLLECTION = 'sessions';

/**
 * Persist a flushed reading session and enqueue one outbox entry.
 *
 * Append-only: `id` is a fresh uuid so `put` never replaces an existing record
 * (invariant #3 — sessions are immutable; there is no update/delete path).
 * Writes exactly one ReadingSession record + one HLC-stamped outbox entry per call (invariant #2).
 *
 * 07b/07c call this once per FlushedSession emitted by reduce.
 */
export async function recordSession(
  deps: { repo: Repository; newId: () => string; newOutboxId: () => string; hlc: Hlc },
  flushed: FlushedSession,
): Promise<ReadingSession> {
  const session = makeReadingSession(flushed, { id: deps.newId(), hlc: deps.hlc });

  await deps.repo.put(SESSIONS_COLLECTION, session);

  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: SESSIONS_COLLECTION,
      recordId: session.id,
      op: 'put',
      payload: session,
    }),
  );

  return session;
}

/**
 * Return all saved sessions, optionally filtered by docId and/or localDay.
 * Filtering ANDs the provided predicates. Ordering and aggregation are stats concerns (08/09).
 */
export async function listSessions(
  repo: Repository,
  filter?: { docId?: string; localDay?: string },
): Promise<ReadingSession[]> {
  if (!filter || (filter.docId === undefined && filter.localDay === undefined)) {
    return repo.query<ReadingSession>(SESSIONS_COLLECTION);
  }
  return repo.query<ReadingSession>(SESSIONS_COLLECTION, (rec) => {
    if (filter.docId !== undefined && rec.docId !== filter.docId) return false;
    if (filter.localDay !== undefined && rec.localDay !== filter.localDay) return false;
    return true;
  });
}
