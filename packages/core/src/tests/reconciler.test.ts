/**
 * Tests for core reconciler (Unit 12b).
 * All fakes are local — NO @ember/store import.
 */
import { describe, expect, it, vi } from 'vitest';

import { applyPull } from '../apply-pull.js';
import { encode, initialClock, parse, receive, tick } from '../hlc.js';
import { makeOutboxEntry } from '../outbox.js';
import type { OutboxEntry } from '../outbox.js';
import {
  reconcile,
  SYNC_META_COLLECTION,
  PULL_CURSOR_ID,
  READING_POSITIONS_COLLECTION,
} from '../reconcile.js';
import type { RemoteEntry, SyncStore, SyncTransport, ReconcilerClock } from '../sync-transport.js';

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

/** In-memory SyncStore fake. */
function makeFakeStore(): SyncStore & {
  _data: Map<string, Map<string, unknown>>;
  _outbox: OutboxEntry[];
  _acked: Set<string>;
} {
  const _data = new Map<string, Map<string, unknown>>();
  const _outbox: OutboxEntry[] = [];
  const _acked = new Set<string>();

  function getCollection(collection: string) {
    if (!_data.has(collection)) _data.set(collection, new Map());
    return _data.get(collection)!;
  }

  return {
    _data,
    _outbox,
    _acked,

    async get<T extends { id: string }>(collection: string, id: string): Promise<T | undefined> {
      return getCollection(collection).get(id) as T | undefined;
    },
    async put<T extends { id: string }>(collection: string, record: T): Promise<void> {
      getCollection(collection).set(record.id, record);
    },
    async delete(collection: string, id: string): Promise<void> {
      getCollection(collection).delete(id);
    },
    async enqueue(entry: OutboxEntry): Promise<void> {
      _outbox.push(entry);
    },
    async unacked(): Promise<OutboxEntry[]> {
      return _outbox.filter((e) => !_acked.has(e.id));
    },
    async ack(ids: string[]): Promise<void> {
      for (const id of ids) _acked.add(id);
    },
  };
}

/** Fake ReconcilerClock backed by the real pure HLC fns. */
function makeFakeClock(node = 'test-node', wallStart = 1_000_000) {
  let clock = tick(initialClock(node), wallStart);
  let wall = wallStart;

  return {
    tick() {
      wall += 1;
      clock = tick(clock, wall);
      return clock;
    },
    receive(remote: ReturnType<typeof parse>) {
      wall += 1;
      clock = receive(clock, remote, wall);
      return clock;
    },
    _current() {
      return clock;
    },
  } satisfies ReconcilerClock & { _current(): ReturnType<typeof parse> };
}

/** Build a RemoteEntry. */
function remoteEntry(
  overrides: Partial<RemoteEntry> & { collection: string; recordId: string; hlc: string },
): RemoteEntry {
  return {
    op: 'put',
    payload: undefined,
    serverSeq: 1,
    ...overrides,
  };
}

let idCounter = 0;
function newId() {
  return `id-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// applyPull unit tests
// ---------------------------------------------------------------------------

describe('applyPull — LWW (default)', () => {
  const hlcLow = encode(tick(initialClock('a'), 1_000_000));
  const hlcHigh = encode(tick(initialClock('a'), 2_000_000));

  it('new remote put (local absent) → put', () => {
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'ann1', text: 'hello', updatedAt: hlcHigh },
    });
    const decision = applyPull(undefined, incoming);
    expect(decision.kind).toBe('put');
    if (decision.kind === 'put') {
      expect(decision.record).toEqual(incoming.payload);
    }
  });

  it('higher-HLC remote overwrites local', () => {
    const local = { id: 'ann1', text: 'old', updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'ann1', text: 'new', updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('put');
  });

  it('lower-HLC remote is skipped (local newer)', () => {
    const local = { id: 'ann1', text: 'newer', updatedAt: hlcHigh };
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcLow,
      op: 'put',
      payload: { id: 'ann1', text: 'old', updatedAt: hlcLow },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('skip');
  });

  it('equal-HLC echo is skipped', () => {
    const local = { id: 'ann1', updatedAt: hlcHigh };
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'ann1', updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('skip');
  });

  it('delete tombstone removes local record (higher HLC remote)', () => {
    const local = { id: 'ann1', updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcHigh,
      op: 'delete',
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('delete');
  });

  it('delete with lower HLC is skipped (local newer)', () => {
    const local = { id: 'ann1', updatedAt: hlcHigh };
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcLow,
      op: 'delete',
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('skip');
  });

  it('documents: no updatedAt → always accept (idempotent)', () => {
    const local = { id: 'doc1', pageCount: 10 }; // no updatedAt
    const incoming = remoteEntry({
      collection: 'documents',
      recordId: 'doc1',
      hlc: hlcLow,
      op: 'put',
      payload: { id: 'doc1', pageCount: 10 },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('put');
  });
});

describe('applyPull — reading-positions (furthest-page)', () => {
  const hlcLow = encode(tick(initialClock('a'), 1_000_000));
  const hlcHigh = encode(tick(initialClock('a'), 2_000_000));

  it('local absent → put the remote record', () => {
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 5, offset: 0.3, updatedAt: hlcHigh },
    });
    const decision = applyPull(undefined, incoming);
    expect(decision.kind).toBe('put');
  });

  it('remote further page → put (advance to remote)', () => {
    const local = { id: 'doc1', page: 3, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 10, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('put');
  });

  it('furthest-page core: remote lower-page higher-HLC → correct (local retained)', () => {
    // local is at page 10 with low HLC; remote is at page 3 with high HLC
    const local = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('correct');
    if (decision.kind === 'correct') {
      expect(decision.winner.page).toBe(10);
    }
  });

  it('local further page, local HLC >= remote → skip (already ahead, no correction needed)', () => {
    // local is at page 10 with high HLC; remote is at page 3 with low HLC
    const local = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcHigh };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcLow,
      op: 'put',
      payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcLow },
    });
    const decision = applyPull(local, incoming);
    expect(decision.kind).toBe('skip');
  });

  it('tie: same page+offset, local HLC wins (mergeReadingPosition returns local) → skip', () => {
    // local has higher updatedAt → mergeReadingPosition returns local
    const local = { id: 'doc1', page: 5, offset: 0.5, updatedAt: hlcHigh };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcLow,
      op: 'put',
      payload: { id: 'doc1', page: 5, offset: 0.5, updatedAt: hlcLow },
    });
    const decision = applyPull(local, incoming);
    // mergeReadingPosition returns local (by HLC) AND incoming.hlc <= local.updatedAt → skip
    expect(decision.kind).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// reconcile integration tests
// ---------------------------------------------------------------------------

describe('reconcile — push', () => {
  it('drains unacked and acks exactly the returned ids', async () => {
    const store = makeFakeStore();
    const hlc1 = tick(initialClock('n'), 1_000_000);
    const hlc2 = tick(initialClock('n'), 1_000_001);
    const e1 = makeOutboxEntry({ id: 'e1', hlc: hlc1, collection: 'annotations', recordId: 'r1', op: 'put', payload: {} });
    const e2 = makeOutboxEntry({ id: 'e2', hlc: hlc2, collection: 'annotations', recordId: 'r2', op: 'put', payload: {} });
    await store.enqueue(e1);
    await store.enqueue(e2);

    const pushedEntries: OutboxEntry[][] = [];
    const transport: SyncTransport = {
      async push(entries) {
        pushedEntries.push(entries);
        return { acked: entries.map((e) => e.id) };
      },
      async pull() { return { entries: [], cursor: 0 }; },
    };

    const clock = makeFakeClock();
    const result = await reconcile({ store, transport, clock, newOutboxId: newId });

    expect(pushedEntries).toHaveLength(1);
    expect(pushedEntries[0]).toHaveLength(2);
    expect(result.pushed).toBe(2);
    // Both should be acked
    expect(store._acked.has('e1')).toBe(true);
    expect(store._acked.has('e2')).toBe(true);
  });

  it('empty outbox → no push call', async () => {
    const store = makeFakeStore();
    const pushSpy = vi.fn(async () => ({ acked: [] as string[] }));
    const transport: SyncTransport = {
      push: pushSpy,
      async pull() { return { entries: [], cursor: 0 }; },
    };
    const clock = makeFakeClock();
    const result = await reconcile({ store, transport, clock, newOutboxId: newId });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(result.pushed).toBe(0);
  });
});

describe('reconcile — pull', () => {
  it('new remote put writes record and enqueues nothing', async () => {
    const store = makeFakeStore();
    const hlcStamp = encode(tick(initialClock('remote'), 1_000_000));
    const payload = { id: 'ann1', text: 'hello', updatedAt: hlcStamp };
    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull() {
        return {
          entries: [{ collection: 'annotations', recordId: 'ann1', hlc: hlcStamp, op: 'put', payload, serverSeq: 1 }],
          cursor: 1,
        };
      },
    };
    const clock = makeFakeClock();
    const result = await reconcile({ store, transport, clock, newOutboxId: newId });

    expect(result.pulled).toBe(1);
    expect(result.corrected).toBe(0);
    const stored = await store.get<typeof payload>('annotations', 'ann1');
    expect(stored).toEqual(payload);
    // No outbox entries should have been enqueued
    expect(store._outbox).toHaveLength(0);
  });

  it('delete removes local record with no enqueue', async () => {
    const store = makeFakeStore();
    const hlcLow = encode(tick(initialClock('n'), 1_000_000));
    const hlcHigh = encode(tick(initialClock('n'), 2_000_000));
    await store.put('annotations', { id: 'ann1', text: 'old', updatedAt: hlcLow });

    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull() {
        return {
          entries: [{ collection: 'annotations', recordId: 'ann1', hlc: hlcHigh, op: 'delete', serverSeq: 1 }],
          cursor: 1,
        };
      },
    };
    const clock = makeFakeClock();
    await reconcile({ store, transport, clock, newOutboxId: newId });

    const stored = await store.get('annotations', 'ann1');
    expect(stored).toBeUndefined();
    expect(store._outbox).toHaveLength(0);
  });

  it('cursor advances and persists to sync-meta', async () => {
    const store = makeFakeStore();
    const hlcStamp = encode(tick(initialClock('remote'), 1_000_000));
    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull(cursor) {
        if (cursor === 0) {
          return {
            entries: [{ collection: 'annotations', recordId: 'r1', hlc: hlcStamp, op: 'put', payload: { id: 'r1', updatedAt: hlcStamp }, serverSeq: 5 }],
            cursor: 5,
          };
        }
        return { entries: [], cursor: 5 };
      },
    };
    const clock = makeFakeClock();
    await reconcile({ store, transport, clock, newOutboxId: newId });

    const meta = await store.get<{ id: string; seq: number }>(SYNC_META_COLLECTION, PULL_CURSOR_ID);
    expect(meta?.seq).toBe(5);
  });

  it('second reconcile pulls only from persisted cursor', async () => {
    const store = makeFakeStore();
    const hlcStamp = encode(tick(initialClock('remote'), 1_000_000));
    const cursorsUsed: number[] = [];
    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull(cursor) {
        cursorsUsed.push(cursor);
        if (cursor === 0) {
          return {
            entries: [{ collection: 'annotations', recordId: 'r1', hlc: hlcStamp, op: 'put', payload: { id: 'r1', updatedAt: hlcStamp }, serverSeq: 5 }],
            cursor: 5,
          };
        }
        return { entries: [], cursor: 5 };
      },
    };
    const clock = makeFakeClock();
    // First reconcile
    await reconcile({ store, transport, clock, newOutboxId: newId });
    // Second reconcile — should start from cursor 5
    await reconcile({ store, transport, clock, newOutboxId: newId });

    // First reconcile: pull(0) → short batch → stops. Second reconcile: pull(5) → empty → stops.
    expect(cursorsUsed).toEqual([0, 5]);
  });

  it('batch larger than limit drains across multiple pull calls', async () => {
    const store = makeFakeStore();
    const hlc1 = encode(tick(initialClock('r'), 1_000_000));
    const hlc2 = encode(tick(initialClock('r'), 2_000_000));
    let callCount = 0;
    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull(cursor, limit = 200) {
        callCount += 1;
        if (cursor === 0) {
          // Return exactly `limit` entries to trigger another pull
          const entries = Array.from({ length: limit }, (_, i) => ({
            collection: 'annotations',
            recordId: `r${i}`,
            hlc: hlc1,
            op: 'put' as const,
            payload: { id: `r${i}`, updatedAt: hlc1 },
            serverSeq: i + 1,
          }));
          return { entries, cursor: limit };
        }
        // Second batch is short → stop draining
        return {
          entries: [{ collection: 'annotations', recordId: 'rLast', hlc: hlc2, op: 'put', payload: { id: 'rLast', updatedAt: hlc2 }, serverSeq: limit + 1 }],
          cursor: limit + 1,
        };
      },
    };
    const clock = makeFakeClock();
    const result = await reconcile({ store, transport, clock, newOutboxId: newId, pullLimit: 200 });
    expect(callCount).toBe(2);
    expect(result.pulled).toBe(201); // 200 + 1
  });
});

describe('reconcile — furthest-page correction', () => {
  it('remote lower-page higher-HLC → exactly one corrective outbox entry, fresh HLC > remote HLC, corrected === 1', async () => {
    const store = makeFakeStore();
    const hlcLow = encode(tick(initialClock('n'), 1_000_000));
    const hlcHigh = encode(tick(initialClock('n'), 2_000_000));

    // Seed a local reading position at page 10 with a LOW HLC
    const localPos = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow };
    await store.put(READING_POSITIONS_COLLECTION, localPos);

    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull() {
        return {
          entries: [{
            collection: READING_POSITIONS_COLLECTION,
            recordId: 'doc1',
            hlc: hlcHigh,   // higher HLC but lower page
            op: 'put',
            payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
            serverSeq: 1,
          }],
          cursor: 1,
        };
      },
    };

    const clock = makeFakeClock('test-node', 3_000_000);
    const result = await reconcile({ store, transport, clock, newOutboxId: newId });

    expect(result.corrected).toBe(1);
    // Should have exactly one outbox entry
    expect(store._outbox).toHaveLength(1);
    const corrective = store._outbox[0]!;
    // Fresh HLC must be > remote HLC
    expect(corrective.hlc > hlcHigh).toBe(true);
    // Local store should have the corrected record at page 10 with the fresh HLC
    const stored = await store.get<{ id: string; page: number; updatedAt: string }>(READING_POSITIONS_COLLECTION, 'doc1');
    expect(stored?.page).toBe(10);
    expect(stored?.updatedAt).toBe(corrective.hlc);
  });

  it('remote further page → put, no correction', async () => {
    const store = makeFakeStore();
    const hlcLow = encode(tick(initialClock('n'), 1_000_000));
    const hlcHigh = encode(tick(initialClock('n'), 2_000_000));

    const localPos = { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcLow };
    await store.put(READING_POSITIONS_COLLECTION, localPos);

    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull() {
        return {
          entries: [{
            collection: READING_POSITIONS_COLLECTION,
            recordId: 'doc1',
            hlc: hlcHigh,
            op: 'put',
            payload: { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcHigh },
            serverSeq: 1,
          }],
          cursor: 1,
        };
      },
    };

    const clock = makeFakeClock();
    const result = await reconcile({ store, transport, clock, newOutboxId: newId });

    expect(result.corrected).toBe(0);
    expect(store._outbox).toHaveLength(0);
    const stored = await store.get<{ id: string; page: number }>(READING_POSITIONS_COLLECTION, 'doc1');
    expect(stored?.page).toBe(10);
  });
});

describe('reconcile — termination', () => {
  it('after a correction, follow-up reconcile pulling back the corrected record yields corrected === 0', async () => {
    const store = makeFakeStore();
    const hlcLow = encode(tick(initialClock('n'), 1_000_000));
    const hlcHigh = encode(tick(initialClock('n'), 2_000_000));

    // Local at page 10, low HLC
    await store.put(READING_POSITIONS_COLLECTION, { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow });

    let pullCallCount = 0;
    let correctedHlc = '';
    const transport: SyncTransport = {
      async push(entries) {
        // Capture the corrective entry's HLC so we can simulate it coming back
        if (entries.length > 0) correctedHlc = entries[0]!.hlc;
        return { acked: entries.map((e) => e.id) };
      },
      async pull() {
        pullCallCount += 1;
        if (pullCallCount === 1) {
          // First pull: remote has page 3 with higher HLC than local → triggers correction
          return {
            entries: [{
              collection: READING_POSITIONS_COLLECTION,
              recordId: 'doc1',
              hlc: hlcHigh,
              op: 'put',
              payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
              serverSeq: 1,
            }],
            cursor: 1,
          };
        }
        // Second pull (after correction was pushed): server echoes back corrected record
        if (correctedHlc && pullCallCount === 2) {
          return {
            entries: [{
              collection: READING_POSITIONS_COLLECTION,
              recordId: 'doc1',
              hlc: correctedHlc,
              op: 'put',
              payload: { id: 'doc1', page: 10, offset: 0.5, updatedAt: correctedHlc },
              serverSeq: 2,
            }],
            cursor: 2,
          };
        }
        return { entries: [], cursor: pullCallCount === 2 ? 2 : 1 };
      },
    };

    const clock = makeFakeClock('test-node', 3_000_000);

    // First reconcile — triggers correction
    const r1 = await reconcile({ store, transport, clock, newOutboxId: newId });
    expect(r1.corrected).toBe(1);

    // Second reconcile — pushes correction, pulls it back, should NOT correct again
    const r2 = await reconcile({ store, transport, clock, newOutboxId: newId });
    expect(r2.corrected).toBe(0);
  });
});

describe('reconcile — clock monotonicity', () => {
  it('after pulling remote stamp t, the next clock.tick() is > t', async () => {
    const store = makeFakeStore();
    const remoteHlc = encode(tick(initialClock('remote'), 9_999_999));

    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull() {
        return {
          entries: [{ collection: 'annotations', recordId: 'r1', hlc: remoteHlc, op: 'put', payload: { id: 'r1', updatedAt: remoteHlc }, serverSeq: 1 }],
          cursor: 1,
        };
      },
    };

    const clock = makeFakeClock('local', 1_000_000); // starts with much smaller wall
    await reconcile({ store, transport, clock, newOutboxId: newId });

    // Next tick should be > remote HLC
    const nextHlc = encode(clock.tick());
    expect(nextHlc > remoteHlc).toBe(true);
  });
});

describe('reconcile — sessions additive', () => {
  it('two distinct session ids both land; neither overwrites the other', async () => {
    const store = makeFakeStore();
    const hlc1 = encode(tick(initialClock('r'), 1_000_000));
    const hlc2 = encode(tick(initialClock('r'), 2_000_000));

    const session1 = { id: 'sess-aaa', docId: 'doc1', localDay: '2025-01-01', tzOffsetMinutes: 0, startedAt: 0, endedAt: 100, activeMs: 100, pages: [1], updatedAt: hlc1 };
    const session2 = { id: 'sess-bbb', docId: 'doc1', localDay: '2025-01-01', tzOffsetMinutes: 0, startedAt: 200, endedAt: 300, activeMs: 100, pages: [2], updatedAt: hlc2 };

    const transport: SyncTransport = {
      async push() { return { acked: [] }; },
      async pull() {
        return {
          entries: [
            { collection: 'sessions', recordId: 'sess-aaa', hlc: hlc1, op: 'put', payload: session1, serverSeq: 1 },
            { collection: 'sessions', recordId: 'sess-bbb', hlc: hlc2, op: 'put', payload: session2, serverSeq: 2 },
          ],
          cursor: 2,
        };
      },
    };

    const clock = makeFakeClock();
    await reconcile({ store, transport, clock, newOutboxId: newId });

    const s1 = await store.get<typeof session1>('sessions', 'sess-aaa');
    const s2 = await store.get<typeof session2>('sessions', 'sess-bbb');
    expect(s1).toEqual(session1);
    expect(s2).toEqual(session2);
  });
});
