// Doc↔tag link model — pure functions, no platform APIs.
// Invariant #1: no platform API import; no @ember/store import.
// Invariant #2: updatedAt is an encoded HLC, equal to the outbox entry hlc.

import type { Hlc } from './hlc.js';
import { encode } from './hlc.js';

// ---------------------------------------------------------------------------
// Collection key
// ---------------------------------------------------------------------------

export const DOC_TAGS_COLLECTION = 'doc-tags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A syncable document↔tag link record.
 * id is DETERMINISTIC: `${documentId}:${tagId}` — so the same (doc,tag) pair
 * converges by LWW across devices instead of forking into two UUIDs.
 * Untag = `repo.delete(docTagId(docId, tagId))`; re-tag = same id, higher HLC.
 * `updatedAt` is an encoded HLC (LWW last-write-wins, invariant #2).
 */
export type DocTag = {
  id: string;           // deterministic: docTagId(documentId, tagId)
  documentId: string;
  tagId: string;
  createdAt: number;
  updatedAt: string;    // encoded HLC (== outbox entry hlc, invariant #2)
};

// ---------------------------------------------------------------------------
// Deterministic id helper
// ---------------------------------------------------------------------------

/**
 * Return the stable link id for a (documentId, tagId) pair.
 * Format: `${documentId}:${tagId}`.
 * Pure. Deterministic: same inputs always yield the same id so concurrent
 * tag operations on the same pair converge via LWW (mirrors duplicatePairId reasoning).
 */
export function docTagId(documentId: string, tagId: string): string {
  return `${documentId}:${tagId}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new DocTag link record.
 * Pure: id = docTagId(documentId, tagId), stamps updatedAt = encode(hlc).
 * No mutation; caller supplies createdAt.
 */
export function makeDocTag(
  args: { documentId: string; tagId: string; createdAt: number },
  ctx: { hlc: Hlc },
): DocTag {
  return {
    id: docTagId(args.documentId, args.tagId),
    documentId: args.documentId,
    tagId: args.tagId,
    createdAt: args.createdAt,
    updatedAt: encode(ctx.hlc),
  };
}
