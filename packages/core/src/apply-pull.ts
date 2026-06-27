// Pure conflict-merge fold — the ONLY place merge logic lives (invariant #5).
// Clock-free: the reconciler driver owns stamping; this function is called per-entry.
// No platform API imports; no @ember/store import.

import type { PositionPolicyMode } from './conflict-policy.js';
import type { ReadingPosition } from './reading-position.js';
import { mergeReadingPosition } from './reading-position.js';
import type { RemoteEntry } from './sync-transport.js';

// The reading-positions literal is owned here — the merge engine is the authority on per-type rules.
const READING_POSITIONS = 'reading-positions';

export type PullDecision =
  | { kind: 'skip' }
  | { kind: 'put'; record: unknown } // write payload locally, NO enqueue
  | { kind: 'delete' } // delete locally, NO enqueue
  | { kind: 'correct'; winner: ReadingPosition }; // furthest-page: local won over higher-HLC remote
// driver re-stamps + puts + enqueues

/**
 * Pure merge fold: given the local record (or undefined if absent) and the incoming
 * remote entry, return the decision the reconciler driver should execute.
 *
 * The local record is typed as a loose record since each collection has a different shape;
 * the per-collection helpers cast to the specific type they need.
 *
 * Invariant #5: this is the ONLY merge logic. No merge logic in reconcile.ts or clients.
 */
export function applyPull(
  local: Record<string, unknown> | undefined,
  incoming: RemoteEntry,
  policy: PositionPolicyMode = 'furthest',
): PullDecision {
  if (incoming.collection === READING_POSITIONS) {
    if (policy === 'latest') {
      // Latest-write-wins: fall through to LWW (no furthest-page protection, never emits 'correct').
      return applyLww(local, incoming);
    }
    // Default ('furthest'): behaviour is byte-identical to the original implementation.
    return applyReadingPosition(local, incoming);
  }
  return applyLww(local, incoming);
}

// ---------------------------------------------------------------------------
// reading-positions: furthest-page policy
// ---------------------------------------------------------------------------

function asReadingPosition(r: Record<string, unknown>): ReadingPosition {
  return r as unknown as ReadingPosition;
}

function applyReadingPosition(
  local: Record<string, unknown> | undefined,
  incoming: RemoteEntry,
): PullDecision {
  if (!local) {
    // No local record — accept incoming unconditionally.
    return { kind: 'put', record: incoming.payload };
  }

  const localPos = asReadingPosition(local);
  const remotePos = incoming.payload as ReadingPosition;
  const winner = mergeReadingPosition(localPos, remotePos);

  if (winner === remotePos) {
    // Remote is further (or tied by page+offset and higher HLC won) → advance to remote.
    // Note: a full tie (mergeReadingPosition returns localPos ref) cannot equal remotePos ref,
    // so this branch covers strictly-remote-wins cases only.
    return { kind: 'put', record: incoming.payload };
  }

  // winner === localPos (local is at least as far as remote)
  const localStamp = (local.updatedAt as string | undefined) ?? '';
  if (incoming.hlc > localStamp) {
    // Lossy supersession: remote has a higher HLC but a lower (or equal) page.
    // The server's canonical record would regress this device's furthest page.
    // Signal the driver to re-stamp and re-enqueue the local winner.
    return { kind: 'correct', winner: localPos };
  }

  // Local is further AND local HLC >= remote HLC → already pushed/pending, no correction needed.
  return { kind: 'skip' };
}

// ---------------------------------------------------------------------------
// default: Last-Write-Wins by encoded HLC
// ---------------------------------------------------------------------------

// No local tombstone table by design: 12a's `pull` returns entries in serverSeq order, which is
// per-key HLC-monotonic (the server only advances a key on LWW-accept). So a key's put always
// arrives before its delete, and no stale lower-HLC put can follow a delete to resurrect it.
// This non-resurrection property is load-bearing on that server-side ordering guarantee.
function applyLww(
  local: Record<string, unknown> | undefined,
  incoming: RemoteEntry,
): PullDecision {
  const localStamp = (local?.updatedAt as string | undefined) ?? '';

  if (incoming.hlc > localStamp) {
    if (incoming.op === 'put') {
      return { kind: 'put', record: incoming.payload };
    }
    return { kind: 'delete' };
  }

  // incoming.hlc <= localStamp → local is newer or equal (our own echo).
  return { kind: 'skip' };
}
