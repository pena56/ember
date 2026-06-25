// Sync ports — structural interfaces injected by platform layers (12c web, 12d mobile).
// Core MUST NOT import @ember/store (store depends on core → cycle).
// Invariant: core imports no platform API.

import type { Hlc } from './hlc.js';
import type { OutboxEntry, OutboxOp } from './outbox.js';

/** One canonical record as returned by the server pull (mirror of 12a pull). */
export type RemoteEntry = {
  collection: string;
  recordId: string;
  hlc: string; // encoded HLC — authoritative incoming stamp (put & delete)
  op: OutboxOp;
  payload?: unknown; // present for 'put', absent for 'delete'
  serverSeq: number;
};

/** Transport port — platform supplies via convex.mutation / convex.query (12c/12d). */
export interface SyncTransport {
  push(entries: OutboxEntry[]): Promise<{ acked: string[] }>;
  pull(cursor: number, limit?: number): Promise<{ entries: RemoteEntry[]; cursor: number }>;
}

/**
 * Minimal subset of store/Repository the reconciler needs.
 * Structural: the real Repository satisfies this without modification.
 * Core must not import @ember/store (cycle); callers satisfy this structurally.
 */
export interface SyncStore {
  get<T extends { id: string }>(collection: string, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(collection: string, record: T): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  enqueue(entry: OutboxEntry): Promise<void>;
  unacked(): Promise<OutboxEntry[]>;
  ack(ids: string[]): Promise<void>;
}

/** Persisted HLC clock the reconciler advances. 12c/12d wrap their existing persisted clock. */
export interface ReconcilerClock {
  tick(): Hlc; // local event → fresh stamp (persists)
  receive(remote: Hlc): Hlc; // merge a remote stamp into the local clock (persists)
}
