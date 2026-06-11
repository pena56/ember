// ReadingPosition type + pure factories — no platform APIs, no Date.now().
// Invariant: core imports no platform API (code-standards).

import { type Hlc, encode } from './hlc.js';

/**
 * Platform-agnostic reading position for a document.
 * id = document id (one position per document — id is both the document id and the record id).
 * page = 1-based page index (integer ≥ 1).
 * offset = relative position within the page, 0..1 (top→bottom).
 * updatedAt = encoded HLC stamp — lexicographic sort agrees with HLC compare.
 */
export type ReadingPosition = {
  id: string;
  page: number;
  offset: number;
  updatedAt: string;
};

/**
 * Pure factory for ReadingPosition records.
 * Guards:
 *   - page = Math.max(1, Math.trunc(args.page))  — integer ≥ 1
 *   - offset = clamp(args.offset, 0, 1)          — viewport math can over/under-shoot
 *   - updatedAt = encode(args.hlc)
 */
export function makeReadingPosition(args: {
  id: string;
  page: number;
  offset: number;
  hlc: Hlc;
}): ReadingPosition {
  return {
    id: args.id,
    page: Math.max(1, Math.trunc(args.page)),
    offset: Math.min(1, Math.max(0, args.offset)),
    updatedAt: encode(args.hlc),
  };
}

/**
 * Pure merge — returns the winning record (one of a/b by reference, never a new object).
 * Furthest-page-wins rule (architecture §Sync, invariant #5):
 *   1. Greater page wins.
 *   2. Equal page → greater offset wins.
 *   3. Equal page + offset → lexicographically greater updatedAt (encoded HLC) wins.
 *   4. All equal → return a (stable).
 *
 * Properties: commutative (merge(a,b) deep-equals merge(b,a)) and idempotent (merge(a,a) === a).
 * This is the first piece of the shared conflict-merge engine; the override (global/per-file)
 * is units 14/17, NOT here.
 */
export function mergeReadingPosition(a: ReadingPosition, b: ReadingPosition): ReadingPosition {
  if (a.page !== b.page) {
    return a.page > b.page ? a : b;
  }
  if (a.offset !== b.offset) {
    return a.offset > b.offset ? a : b;
  }
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b;
  }
  return a;
}
