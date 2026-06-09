// Shared behavioural conformance suite for Repository implementations.
// This file exports a function and runs NO tests on its own import.
// 03b (Dexie) and 03c (expo-sqlite) both call runRepositoryConformance to prove their impls.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encode, initialClock, makeOutboxEntry, tick } from '@ember/core';

import type { Repository } from './repository.js';

export function runRepositoryConformance(
  label: string,
  makeRepo: () => Promise<Repository>,
): void {
  describe(label, () => {
    let repo: Repository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    afterEach(async () => {
      await repo.close();
    });

    // --- put / get / delete ---

    it('put→get round-trip returns the stored record', async () => {
      await repo.put('docs', { id: 'r1', title: 'Hello' });
      const result = await repo.get<{ id: string; title: string }>('docs', 'r1');
      expect(result).toEqual({ id: 'r1', title: 'Hello' });
    });

    it('put is upsert — second put overwrites', async () => {
      await repo.put('docs', { id: 'r1', title: 'v1' });
      await repo.put('docs', { id: 'r1', title: 'v2' });
      const result = await repo.get<{ id: string; title: string }>('docs', 'r1');
      expect(result?.title).toBe('v2');
    });

    it('get miss returns undefined', async () => {
      const result = await repo.get('docs', 'no-such-id');
      expect(result).toBeUndefined();
    });

    it('delete removes the record', async () => {
      await repo.put('docs', { id: 'r1', title: 'Hello' });
      await repo.delete('docs', 'r1');
      const result = await repo.get('docs', 'r1');
      expect(result).toBeUndefined();
    });

    // --- query ---

    it('query with no predicate returns all records in the collection', async () => {
      await repo.put('docs', { id: 'r1' });
      await repo.put('docs', { id: 'r2' });
      const all = await repo.query('docs');
      const ids = all.map((r) => r.id).sort();
      expect(ids).toEqual(['r1', 'r2']);
    });

    it('query with predicate filters records', async () => {
      await repo.put('docs', { id: 'r1', active: true });
      await repo.put('docs', { id: 'r2', active: false });
      const active = await repo.query<{ id: string; active: boolean }>(
        'docs',
        (r) => r.active,
      );
      expect(active.map((r) => r.id)).toEqual(['r1']);
    });

    it('collections are isolated', async () => {
      await repo.put('docs', { id: 'r1' });
      await repo.put('sessions', { id: 'r1' });
      await repo.delete('docs', 'r1');
      const inSessions = await repo.get('sessions', 'r1');
      expect(inSessions).toBeDefined();
    });

    // --- value isolation (structuredClone) ---

    it('mutating a returned record does not change the store', async () => {
      await repo.put('docs', { id: 'r1', count: 0 });
      const rec = await repo.get<{ id: string; count: number }>('docs', 'r1');
      if (rec) rec.count = 999;
      const fresh = await repo.get<{ id: string; count: number }>('docs', 'r1');
      expect(fresh?.count).toBe(0);
    });

    it('mutating input to put does not change the store', async () => {
      const record = { id: 'r1', count: 0 };
      await repo.put('docs', record);
      record.count = 999;
      const stored = await repo.get<{ id: string; count: number }>('docs', 'r1');
      expect(stored?.count).toBe(0);
    });

    it('mutating a record in query results does not change the store', async () => {
      await repo.put('docs', { id: 'r1', count: 0 });
      const results = await repo.query<{ id: string; count: number }>('docs');
      const rec = results[0];
      if (rec) rec.count = 999;
      const fresh = await repo.get<{ id: string; count: number }>('docs', 'r1');
      expect(fresh?.count).toBe(0);
    });

    // --- outbox: enqueue / unacked / ack ---

    it('enqueue→unacked returns entries HLC-ascending regardless of insert order', async () => {
      const node = 'node-test';
      const hlc0 = initialClock(node);
      const hlc1 = tick(hlc0, 1000);
      const hlc2 = tick(hlc1, 2000);
      const hlc3 = tick(hlc2, 2000); // same wall, higher counter

      // Insert in reverse order
      await repo.enqueue(
        makeOutboxEntry({ id: 'e3', hlc: hlc3, collection: 'docs', recordId: 'r3', op: 'put' }),
      );
      await repo.enqueue(
        makeOutboxEntry({ id: 'e1', hlc: hlc1, collection: 'docs', recordId: 'r1', op: 'put' }),
      );
      await repo.enqueue(
        makeOutboxEntry({ id: 'e2', hlc: hlc2, collection: 'docs', recordId: 'r2', op: 'put' }),
      );

      const entries = await repo.unacked();
      expect(entries.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    });

    it('unacked entries are sorted by encoded HLC string (ascending)', async () => {
      const node = 'sort-test';
      const hlc0 = initialClock(node);
      const hlc1 = tick(hlc0, 500);
      const hlc2 = tick(hlc1, 1500);

      await repo.enqueue(
        makeOutboxEntry({ id: 'late', hlc: hlc2, collection: 'c', recordId: 'r2', op: 'put' }),
      );
      await repo.enqueue(
        makeOutboxEntry({ id: 'early', hlc: hlc1, collection: 'c', recordId: 'r1', op: 'put' }),
      );

      const entries = await repo.unacked();
      const hlcs = entries.map((e) => e.hlc);
      expect(hlcs[0]! <= hlcs[1]!).toBe(true);
    });

    it('ack removes acked entries', async () => {
      const hlc = tick(initialClock('n'), 1000);
      await repo.enqueue(
        makeOutboxEntry({ id: 'e1', hlc, collection: 'docs', recordId: 'r1', op: 'put' }),
      );
      await repo.enqueue(
        makeOutboxEntry({ id: 'e2', hlc, collection: 'docs', recordId: 'r2', op: 'put' }),
      );
      await repo.ack(['e1']);
      const remaining = await repo.unacked();
      expect(remaining.map((e) => e.id)).toEqual(['e2']);
    });

    it('ack is idempotent — acking unknown ids is ignored', async () => {
      const hlc = tick(initialClock('n'), 1000);
      await repo.enqueue(
        makeOutboxEntry({ id: 'e1', hlc, collection: 'docs', recordId: 'r1', op: 'put' }),
      );
      await repo.ack(['e1']);
      await expect(repo.ack(['e1', 'never-existed'])).resolves.not.toThrow();
      const remaining = await repo.unacked();
      expect(remaining).toHaveLength(0);
    });

    it('ack with empty array is a no-op', async () => {
      const hlc = tick(initialClock('n'), 1000);
      await repo.enqueue(
        makeOutboxEntry({ id: 'e1', hlc, collection: 'docs', recordId: 'r1', op: 'put' }),
      );
      await repo.ack([]);
      const remaining = await repo.unacked();
      expect(remaining).toHaveLength(1);
    });

    // --- encode ordering property (integration: entry.hlc agrees with encode) ---

    it('encoded HLC in entries is lexicographically sortable consistent with HLC compare', async () => {
      const node = 'enc-test';
      const h1 = tick(initialClock(node), 1000);
      const h2 = tick(h1, 2000);
      const e1 = makeOutboxEntry({ id: 'a', hlc: h1, collection: 'c', recordId: 'r', op: 'put' });
      const e2 = makeOutboxEntry({ id: 'b', hlc: h2, collection: 'c', recordId: 'r', op: 'put' });
      expect(e1.hlc < e2.hlc).toBe(true);
      expect(e1.hlc).toBe(encode(h1));
      expect(e2.hlc).toBe(encode(h2));
    });

    // --- close() coverage ---

    it('close() is idempotent — calling it twice does not throw', async () => {
      // afterEach will call close() once; this call is the second.
      await expect(repo.close()).resolves.not.toThrow();
    });
  });
}
