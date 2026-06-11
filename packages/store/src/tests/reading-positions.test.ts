import { describe, expect, it } from 'vitest';

import { initialClock, tick } from '@ember/core';

import { MemoryRepository } from '../memory-repository.js';
import {
  READING_POSITIONS_COLLECTION,
  getReadingPosition,
  listReadingPositions,
  saveReadingPosition,
} from '../reading-positions.js';

function makeTestDeps() {
  const repo = new MemoryRepository();
  const hlc = tick(initialClock('test-node'), 1_000_000);
  let outboxCounter = 0;
  const newOutboxId = () => `outbox-${++outboxCounter}`;
  return { repo, hlc, newOutboxId };
}

describe('saveReadingPosition', () => {
  it('writes exactly one record + exactly one outbox entry', async () => {
    const deps = makeTestDeps();
    const pos = await saveReadingPosition(deps, { docId: 'doc-1', page: 5, offset: 0.5 });

    // One record stored
    const stored = await deps.repo.get(READING_POSITIONS_COLLECTION, 'doc-1');
    expect(stored).toEqual(pos);

    // Exactly one outbox entry
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.recordId).toBe('doc-1');
    expect(entries[0]!.collection).toBe(READING_POSITIONS_COLLECTION);
    expect(entries[0]!.op).toBe('put');
    expect(entries[0]!.payload).toEqual(pos);
  });

  it('returns the ReadingPosition with id === docId', async () => {
    const deps = makeTestDeps();
    const pos = await saveReadingPosition(deps, { docId: 'doc-abc', page: 3, offset: 0.25 });
    expect(pos.id).toBe('doc-abc');
    expect(pos.page).toBe(3);
    expect(pos.offset).toBe(0.25);
  });

  it('last-write, not furthest: saving page 50 then page 10 → stored is page 10', async () => {
    const deps = makeTestDeps();

    await saveReadingPosition(deps, { docId: 'doc-1', page: 50, offset: 0.9 });
    const pos10 = await saveReadingPosition(deps, { docId: 'doc-1', page: 10, offset: 0.1 });

    const stored = await getReadingPosition(deps.repo, 'doc-1');
    expect(stored).toEqual(pos10);
    expect(stored!.page).toBe(10);

    // Still exactly one record for the doc
    const all = await listReadingPositions(deps.repo);
    expect(all).toHaveLength(1);

    // Two outbox entries appended (one per save)
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
  });
});

describe('getReadingPosition', () => {
  it('returns undefined for an unknown doc id', async () => {
    const deps = makeTestDeps();
    const result = await getReadingPosition(deps.repo, 'nonexistent-doc');
    expect(result).toBeUndefined();
  });

  it('returns the saved position for a known doc id', async () => {
    const deps = makeTestDeps();
    const pos = await saveReadingPosition(deps, { docId: 'doc-2', page: 7, offset: 0.6 });
    const fetched = await getReadingPosition(deps.repo, 'doc-2');
    expect(fetched).toEqual(pos);
  });
});

describe('listReadingPositions', () => {
  it('returns empty array when no positions saved', async () => {
    const repo = new MemoryRepository();
    const result = await listReadingPositions(repo);
    expect(result).toEqual([]);
  });

  it('returns all saved positions across distinct docs', async () => {
    const deps = makeTestDeps();

    await saveReadingPosition(deps, { docId: 'doc-a', page: 1, offset: 0 });
    await saveReadingPosition(deps, { docId: 'doc-b', page: 2, offset: 0.5 });
    await saveReadingPosition(deps, { docId: 'doc-c', page: 3, offset: 1 });

    const positions = await listReadingPositions(deps.repo);
    expect(positions).toHaveLength(3);
    const ids = positions.map((p) => p.id).sort();
    expect(ids).toEqual(['doc-a', 'doc-b', 'doc-c']);
  });
});
