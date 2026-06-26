/**
 * convex-sync-transport.ts — a `SyncTransport` backed by the Convex client.
 *
 * Pure pass-through over `api.sync.push` / `api.sync.pull`: `OutboxEntry`
 * already matches 12a's push validator field-for-field and the pull rows
 * already match `RemoteEntry`, so there is no field remapping. The client
 * auto-attaches the auth token via the app's ConvexAuthProvider.
 */

import type { ConvexReactClient } from 'convex/react';

import { api } from '@ember/convex/_generated/api';
import type { OutboxEntry, RemoteEntry, SyncTransport } from '@ember/core';

export function createConvexSyncTransport(client: ConvexReactClient): SyncTransport {
  return {
    push: (entries: OutboxEntry[]): Promise<{ acked: string[] }> =>
      client.mutation(api.sync.push, { entries }),
    pull: (cursor: number, limit?: number): Promise<{ entries: RemoteEntry[]; cursor: number }> =>
      client.query(api.sync.pull, limit === undefined ? { cursor } : { cursor, limit }),
  };
}
