// Reconciler driver — push-then-pull sync loop with furthest-page corrective re-push.
// Invariant #1: transport is injected; no convex import.
// Invariant #2: pulled records written to local store WITHOUT new outbox entries;
//               the ONLY enqueue is the deliberate furthest-page correction (fresh HLC).
// Invariant #3: sessions are insert-only (handled by applyPull LWW on absent local).
// Invariant #5: all merge logic lives in applyPull, not here.

import { applyPull } from './apply-pull.js';
import { parse } from './hlc.js';
import { makeOutboxEntry } from './outbox.js';
import { makeReadingPosition } from './reading-position.js';
import type { SyncStore, SyncTransport, ReconcilerClock } from './sync-transport.js';

export const SYNC_META_COLLECTION = 'sync-meta';
export const PULL_CURSOR_ID = 'pull-cursor';
export const READING_POSITIONS_COLLECTION = 'reading-positions'; // core-owned literal (mirrors apply-pull)

const DEFAULT_PULL_LIMIT = 200; // matches 12a

export type ReconcileDeps = {
  store: SyncStore;
  transport: SyncTransport;
  clock: ReconcilerClock;
  newOutboxId: () => string;
  pullLimit?: number;
};

export type ReconcileResult = {
  pushed: number;
  pulled: number;
  corrected: number;
};

/**
 * One sync cycle: push local outbox, then pull remote entries and fold them in.
 *
 * Push: drains unacked outbox (HLC-ascending) to transport; acks what the server incorporated.
 * Pull: fetches serverSeq-ordered remote entries, folds each through applyPull, advances cursor.
 */
export async function reconcile(deps: ReconcileDeps): Promise<ReconcileResult> {
  const { store, transport, clock, newOutboxId, pullLimit = DEFAULT_PULL_LIMIT } = deps;

  // -------------------------------------------------------------------------
  // 1. Push
  // -------------------------------------------------------------------------
  let pushed = 0;
  const pending = await store.unacked();
  if (pending.length > 0) {
    const { acked } = await transport.push(pending);
    await store.ack(acked);
    pushed = acked.length;
  }

  // -------------------------------------------------------------------------
  // 2. Pull (cursor loop — drain while batch size === limit)
  // -------------------------------------------------------------------------
  let pulled = 0;
  let corrected = 0;

  // Read persisted cursor (or start from 0).
  const cursorMeta = await store.get<{ id: string; seq: number }>(SYNC_META_COLLECTION, PULL_CURSOR_ID);
  let cursor = cursorMeta?.seq ?? 0;

  let keepPulling = true;
  while (keepPulling) {
    const { entries, cursor: nextCursor } = await transport.pull(cursor, pullLimit);

    for (const e of entries) {
      // Keep local clock ≥ every remote stamp (global monotonicity).
      clock.receive(parse(e.hlc));

      const local = await store.get<{ id: string; updatedAt?: string }>(e.collection, e.recordId);
      const decision = applyPull(local, e);

      switch (decision.kind) {
        case 'put':
          // Write pulled record locally — NO enqueue (invariant #2).
          await store.put(e.collection, decision.record as { id: string });
          break;

        case 'delete':
          // Delete locally — NO enqueue (invariant #2).
          await store.delete(e.collection, e.recordId);
          break;

        case 'skip':
          // Local is at least as current; nothing to do.
          break;

        case 'correct': {
          // Furthest-page correction: local page > remote page but remote HLC is higher.
          // Re-stamp the local winner with a fresh HLC and re-enqueue it so the server
          // canonical record converges upward (monotone join → terminates, invariant #2 note).
          const h = clock.tick();
          const fixed = makeReadingPosition({
            id: e.recordId,
            page: decision.winner.page,
            offset: decision.winner.offset,
            hlc: h,
          });
          await store.put(READING_POSITIONS_COLLECTION, fixed);
          await store.enqueue(
            makeOutboxEntry({
              id: newOutboxId(),
              hlc: h,
              collection: READING_POSITIONS_COLLECTION,
              recordId: e.recordId,
              op: 'put',
              payload: fixed,
            }),
          );
          corrected += 1;
          break;
        }
      }

      pulled += 1;
    }

    // Persist cursor after each batch.
    cursor = nextCursor;
    await store.put(SYNC_META_COLLECTION, { id: PULL_CURSOR_ID, seq: cursor });

    // Drain while the batch is full; a short/empty batch means we are caught up.
    keepPulling = entries.length === pullLimit;
  }

  return { pushed, pulled, corrected };
}
