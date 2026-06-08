// Repository contract — the only interface through which persistence is accessed.
// All persistence goes through this interface; UI/feature code never touches SQLite or
// IndexedDB directly (code-standards).

import type { OutboxEntry } from '@ember/core';

/** Minimum shape for any stored record. */
export type RecordBase = { id: string };

/** Predicate used to filter records in query. */
export type Predicate<T> = (rec: T) => boolean;

/**
 * Generic record store — platform-agnostic contract.
 *
 * @remarks
 * - `put` is an **upsert**: if a record with the same id already exists in the
 *   collection it is fully replaced; otherwise it is inserted.
 * - `query` with no predicate returns **all** records in the collection.
 * - `unacked` returns outbox entries **HLC-ascending** (encoded hlc string sort).
 * - `ack` removes entries from the unacked set and is **idempotent**: unknown ids
 *   are silently ignored; calling ack twice with the same ids is safe.
 * - Implementations MUST deep-clone records on put/get/query so callers cannot
 *   mutate stored state by reference (value isolation invariant).
 */
export interface Repository {
  put<T extends RecordBase>(collection: string, record: T): Promise<void>;
  get<T extends RecordBase>(collection: string, id: string): Promise<T | undefined>;
  query<T extends RecordBase>(collection: string, predicate?: Predicate<T>): Promise<T[]>;
  delete(collection: string, id: string): Promise<void>;

  // outbox
  /** Append an outbox entry. */
  enqueue(entry: OutboxEntry): Promise<void>;
  /** Return all unacked entries sorted ascending by entry.hlc (encoded → string sort). */
  unacked(): Promise<OutboxEntry[]>;
  /** Mark entries as delivered. Idempotent; unknown ids are ignored. */
  ack(ids: string[]): Promise<void>;
  /** Release any held resources (connections, file handles, etc.). */
  close(): Promise<void>;
}
