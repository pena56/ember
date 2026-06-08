import { describe, expect, it } from 'vitest';

import { encode, initialClock, tick } from '../hlc.js';
import { makeOutboxEntry } from '../outbox.js';

describe('makeOutboxEntry', () => {
  const baseHlc = tick(initialClock('node-a'), 1_000_000);

  it('stamps the hlc as encoded string', () => {
    const entry = makeOutboxEntry({
      id: 'entry-1',
      hlc: baseHlc,
      collection: 'docs',
      recordId: 'rec-1',
      op: 'put',
      payload: { title: 'Hello' },
    });
    expect(entry.hlc).toBe(encode(baseHlc));
  });

  it('preserves id, collection, recordId, op, payload for put', () => {
    const payload = { title: 'Hello', body: 'World' };
    const entry = makeOutboxEntry({
      id: 'entry-2',
      hlc: baseHlc,
      collection: 'docs',
      recordId: 'rec-2',
      op: 'put',
      payload,
    });
    expect(entry.id).toBe('entry-2');
    expect(entry.collection).toBe('docs');
    expect(entry.recordId).toBe('rec-2');
    expect(entry.op).toBe('put');
    expect(entry.payload).toEqual(payload);
  });

  it('drops payload for delete', () => {
    const entry = makeOutboxEntry({
      id: 'entry-3',
      hlc: baseHlc,
      collection: 'docs',
      recordId: 'rec-3',
      op: 'delete',
      payload: { title: 'should be dropped' },
    });
    expect(entry.op).toBe('delete');
    expect('payload' in entry).toBe(false);
  });

  it('works for delete without payload arg', () => {
    const entry = makeOutboxEntry({
      id: 'entry-4',
      hlc: baseHlc,
      collection: 'docs',
      recordId: 'rec-4',
      op: 'delete',
    });
    expect('payload' in entry).toBe(false);
  });

  it('hlc string ordering matches HLC compare ordering across two entries', () => {
    const hlc1 = tick(initialClock('node-a'), 1_000_000);
    const hlc2 = tick(hlc1, 2_000_000); // later wall time
    const e1 = makeOutboxEntry({ id: 'e1', hlc: hlc1, collection: 'c', recordId: 'r1', op: 'put' });
    const e2 = makeOutboxEntry({ id: 'e2', hlc: hlc2, collection: 'c', recordId: 'r2', op: 'put' });
    expect(e1.hlc < e2.hlc).toBe(true);
  });
});
