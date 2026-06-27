// Claim-merge planner — pure diff for the review-before-commit account-claim flow.
// Invariant #1: no platform API import; no transport/store import; no @ember/store import.

import type { Document } from './document.js';
import { normalizeTitle } from './duplicate-detection.js';
import type { DuplicatePair } from './duplicate-detection.js';

export type ClaimDocSummary = Pick<Document, 'id' | 'title' | 'byteSize'>;
export type ClaimPositionSummary = { id: string; page: number };

export type ClaimMergePlan = {
  /** DocIds that are remote-only → will be added to this device. */
  incomingDocs: string[];
  /** DocIds present on both sides (same SHA → auto content-addressed merge). */
  sharedDocs: string[];
  /** Cross-side near-duplicate pairs needing a merge/separate decision. */
  duplicateCandidates: DuplicatePair[];
  /** Docs with a reading position on both sides where pages differ. */
  positionReconciles: Array<{
    id: string;
    localPage: number;
    remotePage: number;
    keptPage: number; // max(localPage, remotePage) — furthest
  }>;
};

const DEFAULT_SIZE_BAND = 0.15;

/**
 * Compute a pure plan for reviewing a claim-merge before committing it.
 * All ordering is deterministic (sorted by id).
 */
export function planClaimMerge(args: {
  localDocs: ReadonlyArray<ClaimDocSummary>;
  remoteDocs: ReadonlyArray<ClaimDocSummary>;
  localPositions: ReadonlyArray<ClaimPositionSummary>;
  remotePositions: ReadonlyArray<ClaimPositionSummary>;
  sizeBand?: number;
}): ClaimMergePlan {
  const { localDocs, remoteDocs, localPositions, remotePositions } = args;
  const band = args.sizeBand ?? DEFAULT_SIZE_BAND;

  // --- Set diff on docId ---
  const localIds = new Set(localDocs.map((d) => d.id));
  const remoteIds = new Set(remoteDocs.map((d) => d.id));

  const incomingDocs = [...remoteIds]
    .filter((id) => !localIds.has(id))
    .sort();

  const sharedDocs = [...localIds]
    .filter((id) => remoteIds.has(id))
    .sort();

  // --- Cross-side near-duplicate candidates ---
  // Run the near-dupe rule over the union but only keep pairs that straddle sides:
  // one id must be local-only, the other remote-only. Shared ids are already auto-merged.
  const localOnlyDocs = localDocs.filter((d) => !remoteIds.has(d.id));
  const remoteOnlyDocs = remoteDocs.filter((d) => !localIds.has(d.id));

  const duplicateCandidates: DuplicatePair[] = [];
  const seenPairs = new Set<string>();

  for (const localDoc of localOnlyDocs) {
    for (const remoteDoc of remoteOnlyDocs) {
      // Equal normalized title
      if (normalizeTitle(localDoc.title) !== normalizeTitle(remoteDoc.title)) continue;

      // Size within band
      const maxSize = Math.max(localDoc.byteSize, remoteDoc.byteSize);
      const diff = Math.abs(localDoc.byteSize - remoteDoc.byteSize);
      if (diff > band * maxSize) continue;

      // Stable pair: smaller id first
      const aId = localDoc.id < remoteDoc.id ? localDoc.id : remoteDoc.id;
      const bId = localDoc.id < remoteDoc.id ? remoteDoc.id : localDoc.id;
      const key = `${aId}:${bId}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      duplicateCandidates.push({ aId, bId });
    }
  }

  // Sort by (aId, bId)
  duplicateCandidates.sort((p, q) => {
    if (p.aId !== q.aId) return p.aId < q.aId ? -1 : 1;
    return p.bId < q.bId ? -1 : 1;
  });

  // --- Position reconciles ---
  // Find docs that have a position on both sides with differing pages.
  const localPosMap = new Map(localPositions.map((p) => [p.id, p.page]));
  const remotePosMap = new Map(remotePositions.map((p) => [p.id, p.page]));

  const positionReconciles: ClaimMergePlan['positionReconciles'] = [];

  // Check all ids that appear in both position sets
  const allPositionIds = new Set([...localPosMap.keys(), ...remotePosMap.keys()]);
  for (const id of [...allPositionIds].sort()) {
    const localPage = localPosMap.get(id);
    const remotePage = remotePosMap.get(id);

    // Must have a position on both sides
    if (localPage === undefined || remotePage === undefined) continue;

    // Omit equal pages (nothing to reconcile)
    if (localPage === remotePage) continue;

    positionReconciles.push({
      id,
      localPage,
      remotePage,
      keptPage: Math.max(localPage, remotePage),
    });
  }

  return {
    incomingDocs,
    sharedDocs,
    duplicateCandidates,
    positionReconciles,
  };
}
