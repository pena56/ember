// In-memory reference implementation of Repository.
// Used to (a) self-verify the conformance suite now and (b) serve as a test double for the
// reconciler (Unit 12). Plain JS, no deps.

import type { OutboxEntry } from '@ember/core';

import type { Predicate, RecordBase, Repository } from './repository.js';

export class MemoryRepository implements Repository {
  /** collection name → (id → record) */
  private readonly records = new Map<string, Map<string, RecordBase>>();
  /** entry id → OutboxEntry */
  private readonly outbox = new Map<string, OutboxEntry>();

  private collection(name: string): Map<string, RecordBase> {
    let col = this.records.get(name);
    if (!col) {
      col = new Map();
      this.records.set(name, col);
    }
    return col;
  }

  async put<T extends RecordBase>(collection: string, record: T): Promise<void> {
    // Deep-clone on write so mutations to the caller's object don't affect the store.
    this.collection(collection).set(record.id, structuredClone(record));
  }

  async get<T extends RecordBase>(collection: string, id: string): Promise<T | undefined> {
    const stored = this.collection(collection).get(id);
    if (!stored) return undefined;
    // Deep-clone on read so mutations to the returned object don't affect the store.
    return structuredClone(stored) as T;
  }

  async query<T extends RecordBase>(collection: string, predicate?: Predicate<T>): Promise<T[]> {
    const col = this.collection(collection);
    const all = [...col.values()].map((r) => structuredClone(r) as T);
    return predicate ? all.filter(predicate) : all;
  }

  async delete(collection: string, id: string): Promise<void> {
    this.collection(collection).delete(id);
  }

  async enqueue(entry: OutboxEntry): Promise<void> {
    this.outbox.set(entry.id, entry);
  }

  /** Returns all unacked entries sorted ascending by entry.hlc (string sort). */
  async unacked(): Promise<OutboxEntry[]> {
    return [...this.outbox.values()].sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0));
  }

  /** Idempotent: unknown ids are silently ignored. */
  async ack(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.outbox.delete(id);
    }
  }

  async close(): Promise<void> {
    // No resources to release for the in-memory impl.
  }
}
