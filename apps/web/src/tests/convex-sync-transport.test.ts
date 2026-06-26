/**
 * convex-sync-transport.test.ts — pass-through SyncTransport over Convex.
 *
 * A fake ConvexReactClient (`{ mutation, query }` spies) asserts:
 *  - push calls api.sync.push with `{ entries }` and returns `{ acked }`
 *  - pull(cursor) omits `limit`; pull(cursor, n) includes it
 *  - results pass straight through as `{ entries, cursor }`
 */

import type { ConvexReactClient } from 'convex/react';
import { describe, expect, it, vi } from 'vitest';

import { api } from '@ember/convex/_generated/api';
import type { OutboxEntry, RemoteEntry } from '@ember/core';

import { createConvexSyncTransport } from '../sync/convex-sync-transport.js';

function fakeClient(over: {
  mutation?: ReturnType<typeof vi.fn>;
  query?: ReturnType<typeof vi.fn>;
}): ConvexReactClient {
  return {
    mutation: over.mutation ?? vi.fn(),
    query: over.query ?? vi.fn(),
  } as unknown as ConvexReactClient;
}

const sampleEntry: OutboxEntry = {
  id: 'e1',
  hlc: '000000000001000-00000000-node-a',
  collection: 'annotations',
  recordId: 'a1',
  op: 'put',
  payload: { id: 'a1' },
};

describe('createConvexSyncTransport', () => {
  it('push calls api.sync.push with { entries } and returns { acked }', async () => {
    const mutation = vi.fn().mockResolvedValue({ acked: ['e1'] });
    const transport = createConvexSyncTransport(fakeClient({ mutation }));

    const result = await transport.push([sampleEntry]);

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith(api.sync.push, { entries: [sampleEntry] });
    expect(result).toEqual({ acked: ['e1'] });
  });

  it('pull(cursor) omits limit', async () => {
    const remote: RemoteEntry[] = [];
    const query = vi.fn().mockResolvedValue({ entries: remote, cursor: 7 });
    const transport = createConvexSyncTransport(fakeClient({ query }));

    const result = await transport.pull(3);

    expect(query).toHaveBeenCalledWith(api.sync.pull, { cursor: 3 });
    expect(result).toEqual({ entries: [], cursor: 7 });
  });

  it('pull(cursor, limit) includes limit', async () => {
    const query = vi.fn().mockResolvedValue({ entries: [], cursor: 0 });
    const transport = createConvexSyncTransport(fakeClient({ query }));

    await transport.pull(3, 50);

    expect(query).toHaveBeenCalledWith(api.sync.pull, { cursor: 3, limit: 50 });
  });

  it('pull passes results straight through as { entries, cursor }', async () => {
    const remote: RemoteEntry[] = [
      {
        collection: 'annotations',
        recordId: 'a1',
        hlc: '000000000001000-00000000-node-b',
        op: 'put',
        payload: { id: 'a1' },
        serverSeq: 9,
      },
    ];
    const query = vi.fn().mockResolvedValue({ entries: remote, cursor: 9 });
    const transport = createConvexSyncTransport(fakeClient({ query }));

    const result = await transport.pull(0, 200);

    expect(result).toEqual({ entries: remote, cursor: 9 });
  });
});
