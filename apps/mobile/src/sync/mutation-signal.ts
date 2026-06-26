/**
 * mutation-signal.ts — a tiny synchronous fan-out emitter.
 *
 * Used to wake the reconciler after every local outbox append: the repo wrapper
 * (`withMutationNotify`) calls `notify()` and any subscribed listener (the
 * reconciler's debounced run) is invoked synchronously.
 */

export interface SyncSignal {
  /** Fire every subscriber synchronously. */
  notify(): void;
  /** Subscribe a callback; returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
}

export function createSyncSignal(): SyncSignal {
  const subscribers = new Set<() => void>();
  return {
    notify(): void {
      for (const cb of subscribers) cb();
    },
    subscribe(cb: () => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
