# Unit 12b: core reconciler + conflict-merge fold

Issue: #105 (umbrella #12) · Branch: feat/105-core-reconciler-merge-fold · Boundary: `packages/core`
Route: **standard** — one boundary (`packages/core` + its tests), no new dependency, no UI, no
client wiring. The single open fork (furthest-page strategy) was resolved with the user
(2026-06-25): **fold + corrective re-push**.

Second slice of umbrella **#12**:
**12a** Convex sync server ✅ → **12b** core reconciler + conflict-merge fold (this) →
**12c** web reconciler wiring → **12d** mobile reconciler wiring (device-bound).

## Goal
The single shared conflict-merge engine (**invariant #5**) and the reconciler that drives it —
both in `packages/core`, platform-free. The reconciler:
1. **Push:** drains the outbox (`unacked()`, HLC-ascending) to the injected transport, acks what
   the server incorporated.
2. **Pull:** fetches `serverSeq`-ordered remote entries, folds each into the local store through
   the merge engine, advances a persisted cursor.

This is where the **furthest-page lossiness** flagged in 12a is fixed: the pull fold runs
`mergeReadingPosition` (never regress a device's furthest page) **and**, when a local further page
beats a higher-HLC-but-lower remote write, re-stamps the winner with a fresh HLC and re-enqueues it
so the Convex canonical record converges **upward** (monotone join → terminates). No
session-derivation, no read-model change.

## Resolved forks (2026-06-25)
- **Furthest-page fix = fold + corrective re-push** (user-selected). Pure fold keeps a device from
  regressing its own position; the corrective re-push makes the server canonical (and therefore
  brand-new devices) converge to the true furthest page. Alternatives (fold-only / derive-from-
  session-log) rejected: the first leaves a canonical gap, the second is cross-boundary (read path).
- **Reconciler lives in core, against injected ports.** `packages/store` already depends on
  `@ember/core`, so core must NOT import store (cycle). The reconciler takes a structural **store
  port** (a minimal subset of `Repository` — the real `Repository` satisfies it structurally), a
  **transport port** (12c/12d implement it over `convex.mutation/query`), a **clock port**, and
  `newOutboxId`. Mirrors core's established "caller supplies platform capabilities" pattern.
- **Pull cursor is a local-only record.** Stored via the existing generic store in a `sync-meta`
  collection (`{ id: 'pull-cursor', seq }`); read at pull start, written per batch. **Never
  enqueued → never pushed.** No `Repository` interface change, no store-package change.

## Key facts established from the code (do not re-derive)
- Syncable collections all flow through the outbox as `OutboxEntry` `{id, hlc, collection,
  recordId, op:'put'|'delete', payload?}` (03a). Collections: `documents`, `reading-positions`,
  `sessions`, `annotations`, `goalConfig`.
- **Every put stamps the record's `updatedAt` AND the entry `hlc` from the same `deps.hlc`** (see
  `saveReadingPosition`, `saveAnnotation`, `recordSession`, …). So `entry.hlc === payload.updatedAt`
  for puts; **deletes carry no payload**, only the entry `hlc`. ⇒ Use the **entry-level `hlc`** as
  the incoming LWW stamp (works for puts and deletes); use the local record's `updatedAt` as the
  local stamp.
- 12a `push` returns **every** submitted id in `acked` (incl. LWW-superseded) → ack all.
- 12a `pull` returns entries **`serverSeq`-ascending**, which per key is **HLC-monotonic** (the
  server only advances a key on LWW-accept). ⇒ Applying in arrival order can never resurrect a
  deleted key; **no local tombstone table is needed**.
- `documents` records have **no `updatedAt`** and are content-addressed/immutable (pageCount writes
  are value-identical). LWW with local stamp `?? ''` ⇒ incoming always accepted ⇒ idempotent
  rewrite, converges. Fine.
- `sessions` are append-only/immutable with unique uuids (invariant #3) ⇒ pulled sessions are
  insert-if-absent; same-id collision cannot occur.

## Implementation (all in `packages/core/src`, barrel-export from `index.ts`)

### Ports (new `sync-transport.ts` or alongside the reconciler)
```ts
import type { Hlc } from './hlc.js';
import type { OutboxEntry, OutboxOp } from './outbox.js';

/** One canonical record as returned by the server pull (mirror of 12a `pull`). */
export type RemoteEntry = {
  collection: string;
  recordId: string;
  hlc: string;          // encoded HLC — authoritative incoming stamp (put & delete)
  op: OutboxOp;
  payload?: unknown;    // present for 'put', absent for 'delete'
  serverSeq: number;
};

export interface SyncTransport {
  push(entries: OutboxEntry[]): Promise<{ acked: string[] }>;
  pull(cursor: number, limit?: number): Promise<{ entries: RemoteEntry[]; cursor: number }>;
}

/** Minimal subset of store/Repository the reconciler needs (structural; Repository satisfies it). */
export interface SyncStore {
  get<T extends { id: string }>(collection: string, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(collection: string, record: T): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  enqueue(entry: OutboxEntry): Promise<void>;
  unacked(): Promise<OutboxEntry[]>;
  ack(ids: string[]): Promise<void>;
}

/** Persisted HLC clock the reconciler advances. 12c/12d wrap their existing persisted clock. */
export interface ReconcilerClock {
  tick(): Hlc;                 // local event → fresh stamp (persists)
  receive(remote: Hlc): Hlc;   // merge a remote stamp into the local clock (persists)
}
```

### Pure merge fold — `apply-pull.ts`
`applyPull(local: { updatedAt?: string } | undefined, incoming: RemoteEntry): PullDecision` — **pure,
clock-free** (the driver owns stamping). The single place that knows per-type rules (invariant #5).

```ts
export type PullDecision =
  | { kind: 'skip' }
  | { kind: 'put'; record: unknown }      // write payload locally, NO enqueue
  | { kind: 'delete' }                    // delete locally, NO enqueue
  | { kind: 'correct'; winner: ReadingPosition }; // furthest-page: local won over a higher-HLC
                                                  // remote → driver re-stamps + puts + enqueues
```

Policy by collection (a small registry core owns; default = LWW). The `'reading-positions'` literal
is owned here intentionally — the merge engine is the authority on per-type rules.

- **`reading-positions` → furthest-page:**
  - `local` undefined → `{ kind:'put', record: payload }`.
  - else `winner = mergeReadingPosition(local, payload)`:
    - `winner` is the incoming record → `{ kind:'put', record: payload }` (advance to remote; on a
      full tie `mergeReadingPosition` returns the *local* ref → falls to the next branch → skip).
    - `winner` is local **and** `incoming.hlc > local.updatedAt` → **lossy supersession**:
      `{ kind:'correct', winner: local }`.
    - `winner` is local **and** `incoming.hlc <= local.updatedAt` → local is further and not older
      (already pushed/pending) → `{ kind:'skip' }`.
- **default → LWW** (documents, annotations, sessions, goalConfig, any future collection):
  - accept iff `incoming.hlc > (local?.updatedAt ?? '')`:
    - `op:'put'` → `{ kind:'put', record: payload }`; `op:'delete'` → `{ kind:'delete' }`.
  - else → `{ kind:'skip' }` (local newer, or our own echo).

> Sessions fall out of LWW correctly: distinct uuids ⇒ `local` always undefined ⇒ insert (additive
> union, invariant #3). Documents: no `updatedAt` ⇒ `?? ''` ⇒ idempotent accept.

### Reconciler driver — `reconcile.ts`
```ts
export const SYNC_META_COLLECTION = 'sync-meta';
export const PULL_CURSOR_ID = 'pull-cursor';
export const READING_POSITIONS_COLLECTION = 'reading-positions'; // core-owned literal (see above)

export type ReconcileDeps = {
  store: SyncStore;
  transport: SyncTransport;
  clock: ReconcilerClock;
  newOutboxId: () => string;
  pullLimit?: number; // default 200 (matches 12a)
};
export type ReconcileResult = { pushed: number; pulled: number; corrected: number };

export async function reconcile(deps: ReconcileDeps): Promise<ReconcileResult>;
```
Algorithm:
1. **Push:** `entries = await store.unacked()`. If non-empty: `{ acked } = await transport.push(entries)`;
   `await store.ack(acked)`. `pushed = acked.length`.
2. **Pull:** read cursor from `store.get(SYNC_META_COLLECTION, PULL_CURSOR_ID)?.seq ?? 0`. Loop:
   - `{ entries, cursor: next } = await transport.pull(cursor, limit)`.
   - For each `e` in order:
     - `clock.receive(parse(e.hlc))` — keep the local clock ≥ every remote stamp (global
       monotonicity), regardless of merge outcome.
     - `local = await store.get(e.collection, e.recordId)`; `decision = applyPull(local, e)`:
       - `'put'` → `store.put(e.collection, decision.record)` (**no enqueue**).
       - `'delete'` → `store.delete(e.collection, e.recordId)` (**no enqueue**).
       - `'skip'` → nothing.
       - `'correct'` → `h = clock.tick()`;
         `fixed = makeReadingPosition({ id, page: winner.page, offset: winner.offset, hlc: h })`;
         `store.put(READING_POSITIONS_COLLECTION, fixed)`;
         `store.enqueue(makeOutboxEntry({ id: newOutboxId(), hlc: h, collection: READING_POSITIONS_COLLECTION, recordId: id, op: 'put', payload: fixed }))`;
         `corrected += 1`. (The corrective entry ships on the next push cycle; monotone join ⇒
         no perpetual ping-pong.)
   - `cursor = next`; persist `store.put(SYNC_META_COLLECTION, { id: PULL_CURSOR_ID, seq: cursor })`.
   - Repeat while `entries.length === limit` (drain); stop when a short/empty batch arrives.
3. Return `{ pushed, pulled, corrected }`.

Order is **push-then-pull** (drain local first so fewer corrective re-pushes are needed).

## Tests (`packages/core/src/tests`, vitest, TDD)
Use a tiny in-memory `SyncStore` fake + a scriptable `SyncTransport` fake (captures pushes, returns
scripted pull batches) + a fake `ReconcilerClock` over the real pure `hlc` fns. **No `@ember/store`
import** (avoid a dev cycle — the fake is trivial given the 6-method port).

- Push drains `unacked()` and acks exactly the returned ids; empty outbox ⇒ no push call.
- Pull: new remote put (local absent) writes the record and enqueues **nothing**.
- LWW: higher-HLC remote overwrites local; lower-HLC remote is skipped; equal-HLC echo is skipped.
- Delete tombstone removes the local record (no enqueue).
- **Furthest-page core case:** remote lower-page **higher-HLC** ⇒ local further page retained,
  exactly **one** corrective outbox entry enqueued with a fresh HLC **>** the remote HLC, local
  `updatedAt` bumped, result `corrected === 1`.
- Furthest-page: remote **further** page ⇒ local advances to remote (`put`, no correction).
- Cursor: advances and persists to `sync-meta`; a second `reconcile` pulls only `serverSeq > cursor`;
  a batch larger than `limit` is drained across multiple `pull` calls.
- Clock monotonicity: after pulling remote stamp `t`, the next `clock.tick()` is `> t`.
- Sessions additive: two distinct session ids both land; neither overwrites the other.
- **Termination:** after a correction, a follow-up `reconcile` that pulls the corrected record back
  yields `corrected === 0` (skip/echo) — the join has converged.

## Dependencies
None. No new runtime or dev dependency; `packages/core` already has vitest. No `convex/`, no
`packages/store`, no client change.

## Verify when done
- [ ] `pnpm -w typecheck` passes (core gains the reconciler + ports; no `@ember/store` import in core).
- [ ] `pnpm -w test` passes (new core reconciler/merge suite green; all prior suites unchanged).
- [ ] `pnpm -w lint` clean.
- [ ] **Invariant #5** — the *only* merge logic added lives in core's `applyPull`; clients invent none.
- [ ] **Invariant #2** — pulled records are written **without** new outbox entries; the **only**
      enqueue is the deliberate furthest-page correction (fresh HLC). Never a direct Convex write.
- [ ] **Invariant #1** — reconciler writes pulled data to the **local** store; reads stay local; the
      transport is injected (no `convex` import in core) — the app still functions with no transport.
- [ ] **Invariant #3** — sessions are insert-only in the fold; nothing overwrites a session.
- [ ] No `Repository` interface change, no `packages/store` change, no `convex/` change, no UI.

## Deferred (not 12b)
- **Client wiring** — constructing the real `SyncTransport` over `convex.mutation(api.sync.push)` /
  `convex.query(api.sync.pull)`, adapting the persisted clock to `ReconcilerClock`, and scheduling
  `reconcile` (online/interval/onMutation): web = **12c**, mobile = **12d** (device-bound).
- Reconcile **scheduling/triggering** policy (when to call it) is a client concern (12c/12d).
- Position **override** (global / per-file furthest-page opt-out) is units 14/17, not here.
```
