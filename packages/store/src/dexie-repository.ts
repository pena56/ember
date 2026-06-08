// IndexedDB-backed Repository implementation using Dexie 4.
// Uses the ambient global `indexedDB`; do NOT import fake-indexeddb here — the test
// harness (src/tests/setup.ts) supplies it via fake-indexeddb/auto.

import { Dexie } from 'dexie';
import type { Table } from 'dexie';

import type { OutboxEntry } from '@ember/core';

import type { Predicate, RecordBase, Repository } from './repository.js';

/** Row stored in the `records` table. */
interface RecordRow {
  collection: string;
  id: string;
  record: RecordBase;
}

/**
 * IndexedDB-backed `Repository` implementation via Dexie 4.
 *
 * @remarks
 * - Records are stored in a single `records` table keyed by the compound
 *   primary key `[collection+id]`, with a `collection` index for collection scans.
 * - Outbox entries are stored in an `outbox` table keyed by `id`, with an `hlc`
 *   index that enables lexicographic (HLC-ascending) ordering without a sort pass.
 * - `structuredClone` is applied on every write **and** read to enforce the value
 *   isolation invariant required by the `Repository` contract.
 * - The constructor accepts a database name (default `'ember'`) so each test
 *   instance gets an isolated IndexedDB database.
 */
export class DexieRepository implements Repository {
  private readonly db: Dexie;
  private readonly records: Table<RecordRow, [string, string]>;
  private readonly outbox: Table<OutboxEntry, string>;

  constructor(name = 'ember') {
    const db = new Dexie(name);
    db.version(1).stores({
      // Compound primary key; `collection` index for collection-scoped queries.
      records: '[collection+id], collection',
      // Keyed by `id`; `hlc` index for HLC-ascending unacked() scans.
      outbox: 'id, hlc',
    });
    this.db = db;
    this.records = db.table<RecordRow, [string, string]>('records');
    this.outbox = db.table<OutboxEntry, string>('outbox');
  }

  async put<T extends RecordBase>(collection: string, record: T): Promise<void> {
    // Clone on write — mutations to the caller's object after put must not affect the store.
    const cloned = structuredClone(record);
    await this.records.put({ collection, id: cloned.id, record: cloned });
  }

  async get<T extends RecordBase>(collection: string, id: string): Promise<T | undefined> {
    const row = await this.records.get([collection, id]);
    if (!row) return undefined;
    // Clone on read — mutations to the returned object must not affect the store.
    return structuredClone(row.record) as T;
  }

  async query<T extends RecordBase>(collection: string, predicate?: Predicate<T>): Promise<T[]> {
    const rows = await this.records.where('collection').equals(collection).toArray();
    const records = rows.map((row) => structuredClone(row.record) as T);
    return predicate ? records.filter(predicate) : records;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.records.delete([collection, id]);
  }

  async enqueue(entry: OutboxEntry): Promise<void> {
    // Clone the entry so the caller cannot mutate what is stored.
    await this.outbox.put(structuredClone(entry));
  }

  /**
   * Returns all unacked outbox entries sorted HLC-ascending.
   * The `hlc` index provides lexicographic order, which equals HLC ascending because
   * the encoded HLC string is lexicographically sortable (Unit 03a guarantee).
   */
  async unacked(): Promise<OutboxEntry[]> {
    const rows = await this.outbox.orderBy('hlc').toArray();
    return rows.map((row) => structuredClone(row));
  }

  /** Idempotent: unknown ids are silently ignored by Dexie's bulkDelete. */
  async ack(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.outbox.bulkDelete(ids);
  }

  /** Release the Dexie/IndexedDB connection. */
  async close(): Promise<void> {
    this.db.close();
  }
}
