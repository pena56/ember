/**
 * with-mutation-notify.ts — a delegating Repository that fires a notifier after
 * every outbox append.
 *
 * Every syncable mutation funnels through `repo.enqueue`, so wrapping that one
 * method gives the reconciler a wake signal on each local change with a single
 * chokepoint and zero changes to the WebStore mutators. All other methods pass
 * straight through to the underlying repo (same instance — value isolation and
 * outbox state are unchanged).
 */

import type { OutboxEntry } from '@ember/core';
import type { Predicate, RecordBase, Repository } from '@ember/store';

export function withMutationNotify(repo: Repository, notify: () => void): Repository {
  return {
    put<T extends RecordBase>(collection: string, record: T): Promise<void> {
      return repo.put(collection, record);
    },
    get<T extends RecordBase>(collection: string, id: string): Promise<T | undefined> {
      return repo.get<T>(collection, id);
    },
    query<T extends RecordBase>(collection: string, predicate?: Predicate<T>): Promise<T[]> {
      return repo.query<T>(collection, predicate);
    },
    delete(collection: string, id: string): Promise<void> {
      return repo.delete(collection, id);
    },
    async enqueue(entry: OutboxEntry): Promise<void> {
      await repo.enqueue(entry);
      notify();
    },
    unacked(): Promise<OutboxEntry[]> {
      return repo.unacked();
    },
    ack(ids: string[]): Promise<void> {
      return repo.ack(ids);
    },
    close(): Promise<void> {
      return repo.close();
    },
  };
}
