import { describe, expect, it } from 'vitest';

import type { FlushedSession } from '@ember/core';
import { initialClock, tick } from '@ember/core';

import { MemoryRepository } from '../memory-repository.js';
import {
  SESSIONS_COLLECTION,
  listSessions,
  recordSession,
} from '../sessions.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTestDeps() {
  const repo = new MemoryRepository();
  const hlc = tick(initialClock('test-node'), 1_000_000);
  let idCounter = 0;
  let outboxCounter = 0;
  const newId = () => `session-uuid-${++idCounter}`;
  const newOutboxId = () => `outbox-${++outboxCounter}`;
  return { repo, hlc, newId, newOutboxId };
}

/** Wall ms at 2024-03-15 00:00:00 UTC */
const BASE_UTC = Date.UTC(2024, 2, 15, 0, 0, 0, 0);

function makeFlushed(overrides: Partial<FlushedSession> = {}): FlushedSession {
  return {
    docId: 'doc-abc',
    localDay: '2024-03-15',
    tzOffsetMinutes: 0,
    startedAt: BASE_UTC,
    endedAt: BASE_UTC + 45_000,
    activeMs: 45_000,
    pages: [1, 2],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recordSession
// ---------------------------------------------------------------------------

describe('recordSession', () => {
  it('writes exactly one record + exactly one outbox entry', async () => {
    const deps = makeTestDeps();
    const flushed = makeFlushed();
    const session = await recordSession(deps, flushed);

    // One record stored with the session's uuid id (not docId)
    const stored = await deps.repo.get(SESSIONS_COLLECTION, session.id);
    expect(stored).toEqual(session);
    expect(session.id).toBe('session-uuid-1');
    expect(session.id).not.toBe(flushed.docId);

    // Exactly one outbox entry
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.recordId).toBe(session.id);
    expect(entries[0]!.collection).toBe(SESSIONS_COLLECTION);
    expect(entries[0]!.op).toBe('put');
    expect(entries[0]!.payload).toEqual(session);
  });

  it('returned session preserves all flushed fields', async () => {
    const deps = makeTestDeps();
    const flushed = makeFlushed();
    const session = await recordSession(deps, flushed);

    expect(session.docId).toBe(flushed.docId);
    expect(session.localDay).toBe(flushed.localDay);
    expect(session.tzOffsetMinutes).toBe(flushed.tzOffsetMinutes);
    expect(session.startedAt).toBe(flushed.startedAt);
    expect(session.endedAt).toBe(flushed.endedAt);
    expect(session.activeMs).toBe(flushed.activeMs);
    expect(session.pages).toEqual(flushed.pages);
  });

  it('two calls for the same docId create TWO distinct records (append-only — no overwrite)', async () => {
    const deps = makeTestDeps();
    const flushed = makeFlushed();

    const session1 = await recordSession(deps, flushed);
    const session2 = await recordSession(deps, { ...flushed, activeMs: 60_000 });

    // Different ids
    expect(session1.id).not.toBe(session2.id);

    // Both records exist in the store
    const stored1 = await deps.repo.get(SESSIONS_COLLECTION, session1.id);
    const stored2 = await deps.repo.get(SESSIONS_COLLECTION, session2.id);
    expect(stored1).toEqual(session1);
    expect(stored2).toEqual(session2);

    // First record was NOT overwritten — its activeMs is still 45_000
    expect((stored1 as typeof session1).activeMs).toBe(45_000);
    expect((stored2 as typeof session2).activeMs).toBe(60_000);

    // Two outbox entries appended (one per recordSession call)
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
    const entryIds = entries.map((e) => e.recordId);
    expect(entryIds).toContain(session1.id);
    expect(entryIds).toContain(session2.id);
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe('listSessions', () => {
  it('returns empty array when no sessions saved', async () => {
    const repo = new MemoryRepository();
    const result = await listSessions(repo);
    expect(result).toEqual([]);
  });

  it('returns all saved sessions with no filter', async () => {
    const deps = makeTestDeps();
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-2', localDay: '2024-03-16' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-16' }));

    const all = await listSessions(deps.repo);
    expect(all).toHaveLength(3);
  });

  it('filters by docId correctly', async () => {
    const deps = makeTestDeps();
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-2', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-16' }));

    const byDoc = await listSessions(deps.repo, { docId: 'doc-1' });
    expect(byDoc).toHaveLength(2);
    expect(byDoc.every((s) => s.docId === 'doc-1')).toBe(true);
  });

  it('filters by localDay correctly', async () => {
    const deps = makeTestDeps();
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-2', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-16' }));

    const byDay = await listSessions(deps.repo, { localDay: '2024-03-15' });
    expect(byDay).toHaveLength(2);
    expect(byDay.every((s) => s.localDay === '2024-03-15')).toBe(true);
  });

  it('ANDs docId + localDay filter', async () => {
    const deps = makeTestDeps();
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-2', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-16' }));

    const andFilter = await listSessions(deps.repo, { docId: 'doc-1', localDay: '2024-03-15' });
    expect(andFilter).toHaveLength(1);
    expect(andFilter[0]!.docId).toBe('doc-1');
    expect(andFilter[0]!.localDay).toBe('2024-03-15');
  });

  it('returns empty array when filter matches nothing', async () => {
    const deps = makeTestDeps();
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-15' }));

    const result = await listSessions(deps.repo, { docId: 'doc-999' });
    expect(result).toEqual([]);
  });

  it('undefined filter fields are ignored (partial filter)', async () => {
    const deps = makeTestDeps();
    await recordSession(deps, makeFlushed({ docId: 'doc-1', localDay: '2024-03-15' }));
    await recordSession(deps, makeFlushed({ docId: 'doc-2', localDay: '2024-03-16' }));

    // Only docId provided — localDay is not filtered (omit the key entirely to satisfy exactOptionalPropertyTypes)
    const result = await listSessions(deps.repo, { docId: 'doc-1' });
    expect(result).toHaveLength(1);
    expect(result[0]!.docId).toBe('doc-1');
  });
});
