// Outbox primitives — pure types + factory. No crypto/uuid import; caller supplies id.
// Invariant: core imports no platform API (code-standards).

import type { Hlc } from './hlc.js';
import { encode } from './hlc.js';

export type OutboxOp = 'put' | 'delete';

export type OutboxEntry = {
  id: string; // unique entry id (uuid supplied by caller — keeps core platform-free)
  hlc: string; // encoded Hlc stamp — ordering key; string-sort agrees with HLC compare
  collection: string; // target collection name
  recordId: string; // id of the affected record
  op: OutboxOp;
  payload?: unknown; // record body for 'put'; omitted for 'delete'
};

/**
 * Stamp an outbox entry with the encoded HLC.
 * For op:'delete' the payload is dropped so the outbox never leaks deleted record data.
 */
export function makeOutboxEntry(args: {
  id: string;
  hlc: Hlc;
  collection: string;
  recordId: string;
  op: OutboxOp;
  payload?: unknown;
}): OutboxEntry {
  const base = {
    id: args.id,
    hlc: encode(args.hlc),
    collection: args.collection,
    recordId: args.recordId,
    op: args.op,
  };
  if (args.op === 'put') {
    return { ...base, payload: args.payload };
  }
  return base;
}
