// Per-file / global reading-position conflict policy — pure functions, no platform APIs.
// Invariant #1: no platform API import; no @ember/store import.
// Invariant #2: updatedAt is an encoded HLC.

import { type Hlc, encode } from './hlc.js';

export const CONFLICT_POLICY_COLLECTION = 'conflict-policy';

/** How to merge concurrent reading-position updates. */
export type PositionPolicyMode = 'furthest' | 'latest';

/** The well-known id for the global (device-default) policy record. */
export const GLOBAL_POLICY_ID = 'global';

/**
 * A syncable policy record.
 * id = 'global' for the device-wide default, or a docId for a per-file override.
 */
export type ConflictPolicy = {
  id: string;           // 'global' or a docId
  mode: PositionPolicyMode;
  updatedAt: string;    // encoded HLC
};

/** Pure factory for ConflictPolicy records. */
export function makeConflictPolicy(args: {
  id: string;
  mode: PositionPolicyMode;
  hlc: Hlc;
}): ConflictPolicy {
  return {
    id: args.id,
    mode: args.mode,
    updatedAt: encode(args.hlc),
  };
}

/**
 * Resolve the effective position policy for a given docId.
 * Precedence: per-file override (id === docId) → global (id === GLOBAL_POLICY_ID) → 'furthest'.
 * Pure.
 */
export function resolvePositionPolicy(
  policies: ReadonlyArray<ConflictPolicy>,
  docId: string,
): PositionPolicyMode {
  // Per-file override takes priority
  const perFile = policies.find((p) => p.id === docId);
  if (perFile) return perFile.mode;

  // Global policy
  const global = policies.find((p) => p.id === GLOBAL_POLICY_ID);
  if (global) return global.mode;

  // Default
  return 'furthest';
}
