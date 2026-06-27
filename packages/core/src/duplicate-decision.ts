// Duplicate-decision model — pure functions, no platform APIs.
// Invariant #1: no platform API import; no @ember/store import.
// Invariant #2: updatedAt is an encoded HLC, equal to the outbox entry hlc.

import { type Hlc, encode } from './hlc.js';

export const DUPLICATE_DECISIONS_COLLECTION = 'duplicate-decisions';

/**
 * A persisted decision about a near-duplicate pair.
 * id = `${aId}:${bId}` where aId < bId — stable key that both devices converge (LWW).
 * 'merged' → aliasId is folded into canonicalId (hidden from library, positions re-pointed).
 * 'separate' → user confirmed these are different documents; no aliasing.
 */
export type DuplicateDecision = {
  id: string;          // stable pair key `${aId}:${bId}` (aId < bId)
  canonicalId: string; // doc kept as the merged identity
  aliasId: string;     // doc folded into canonical
  decision: 'merged' | 'separate';
  updatedAt: string;   // encoded HLC (== outbox entry hlc, invariant #2)
};

/**
 * Return the stable pair key for the given ids.
 * Order-independent: duplicatePairId(a, b) === duplicatePairId(b, a).
 */
export function duplicatePairId(aId: string, bId: string): string {
  const min = aId < bId ? aId : bId;
  const max = aId < bId ? bId : aId;
  return `${min}:${max}`;
}

/**
 * Construct and validate a DuplicateDecision record.
 * Throws if canonicalId is not one of {aId, bId}.
 */
export function makeDuplicateDecision(args: {
  aId: string;
  bId: string;
  canonicalId: string;
  decision: 'merged' | 'separate';
  hlc: Hlc;
}): DuplicateDecision {
  const { aId, bId, canonicalId, decision, hlc } = args;

  if (canonicalId !== aId && canonicalId !== bId) {
    throw new Error(
      `canonicalId "${canonicalId}" must be one of the pair: "${aId}", "${bId}"`,
    );
  }

  const aliasId = canonicalId === aId ? bId : aId;
  const id = duplicatePairId(aId, bId);

  return {
    id,
    canonicalId,
    aliasId,
    decision,
    updatedAt: encode(hlc),
  };
}

/**
 * Resolve a docId to its effective canonical, following 'merged' decisions transitively.
 * 'separate' decisions are ignored.
 * Unknown id (no decision) returns itself.
 * Cycle guard: if a cycle is detected, returns the input docId rather than looping.
 *
 * Assumes the store holds one record per pair id (LWW convergence), so this never sees both a
 * 'merged' and a 'separate' decision for the same pair simultaneously.
 */
export function resolveCanonicalId(
  decisions: ReadonlyArray<DuplicateDecision>,
  docId: string,
): string {
  // Build a lookup: aliasId → canonicalId for 'merged' decisions only
  const mergeMap = new Map<string, string>();
  for (const d of decisions) {
    if (d.decision === 'merged') {
      mergeMap.set(d.aliasId, d.canonicalId);
    }
  }

  // Follow the chain with a visited set for cycle detection
  const visited = new Set<string>();
  let current = docId;

  while (mergeMap.has(current)) {
    if (visited.has(current)) {
      // Cycle detected — return the original input
      return docId;
    }
    visited.add(current);
    current = mergeMap.get(current)!;
  }

  return current;
}
