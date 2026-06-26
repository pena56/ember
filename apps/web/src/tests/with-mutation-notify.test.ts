/**
 * with-mutation-notify.test.ts — repo wrapper fires notify after enqueue only.
 *
 *  - notify fires exactly once, after the inner enqueue resolves
 *  - get / put / delete / unacked / ack delegate and do NOT notify
 */

import { describe, expect, it, vi } from 'vitest';

import type { OutboxEntry } from '@ember/core';
import { MemoryRepository } from '@ember/store';

import { withMutationNotify } from '../sync/with-mutation-notify.js';

const entry: OutboxEntry = {
  id: 'e1',
  hlc: '000000000001000-00000000-node-a',
  collection: 'annotations',
  recordId: 'a1',
  op: 'put',
  payload: { id: 'a1' },
};

describe('withMutationNotify', () => {
  it('fires notify exactly once after enqueue resolves', async () => {
    const inner = new MemoryRepository();
    const notify = vi.fn();
    const repo = withMutationNotify(inner, notify);

    await repo.enqueue(entry);

    expect(notify).toHaveBeenCalledTimes(1);
    // The entry actually reached the underlying outbox.
    expect(await inner.unacked()).toHaveLength(1);
  });

  it('notify fires AFTER the inner enqueue has resolved', async () => {
    const inner = new MemoryRepository();
    const order: string[] = [];
    const spied = {
      ...inner,
      enqueue: async (e: OutboxEntry) => {
        await inner.enqueue(e);
        order.push('enqueue');
      },
    } as unknown as MemoryRepository;
    const repo = withMutationNotify(spied, () => order.push('notify'));

    await repo.enqueue(entry);

    expect(order).toEqual(['enqueue', 'notify']);
  });

  it('does NOT notify on get / put / delete / unacked / ack', async () => {
    const inner = new MemoryRepository();
    const notify = vi.fn();
    const repo = withMutationNotify(inner, notify);

    await repo.put('annotations', { id: 'a1' });
    await repo.get('annotations', 'a1');
    await repo.query('annotations');
    await repo.delete('annotations', 'a1');
    await repo.unacked();
    await repo.ack(['e1']);

    expect(notify).not.toHaveBeenCalled();
  });

  it('delegates reads/writes to the underlying repo', async () => {
    const inner = new MemoryRepository();
    const repo = withMutationNotify(inner, vi.fn());

    await repo.put('docs', { id: 'd1', title: 'x' });
    expect(await repo.get('docs', 'd1')).toEqual({ id: 'd1', title: 'x' });
    expect(await inner.get('docs', 'd1')).toEqual({ id: 'd1', title: 'x' });
  });
});
