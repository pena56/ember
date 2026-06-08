# Unit 03a: Core sync primitives — HLC clock + outbox + Repository interface

Issue: #26 · Branch: feat/26-core-sync-primitives · Boundary: `packages/core` + `packages/store` (interface only)
Route: standard — pure TS, no new runtime dep, all logic unit-testable on the host. First slice
of build-plan Unit 03 (split: 03a core/contract → 03b Dexie/web impl → 03c SQLite/mobile impl).

## Goal
Land the platform-agnostic foundation of the local-first store: a Hybrid Logical Clock, the
append-only outbox entry + stamping helper, the generic `Repository` interface, an in-memory
reference `Repository`, and a reusable conformance test suite that 03b/03c will run their real
impls against. No persistence to a real device/browser store yet — that's 03b/03c.

## Scope decisions (confirmed 2026-06-08)
- **Generic record store**, not domain-typed. `Repository` stores `{ id: string }` records in
  named collections; Document/Session/Position/Annotation/Tag types arrive with their own units
  (04/07/10). No speculative entity schema here.
- **Shared conformance suite** in `packages/store` so 03b (Dexie under `fake-indexeddb`) and 03c
  (expo-sqlite, on-device) prove identical behaviour against one spec.

## Implementation

### `packages/core/src/hlc.ts` (new) — Hybrid Logical Clock
Pure functions; no `Date.now()` inside (caller passes physical time so it's testable). Invariant:
HLC is the *only* ordering source (code-standards: never `Date.now()` for ordering).

```ts
export type Hlc = { wall: number; counter: number; node: string }; // wall = ms epoch
```
- `tick(prev: Hlc, physicalNow: number): Hlc` — local event. `wall = max(prev.wall, physicalNow)`;
  `counter = wall === prev.wall ? prev.counter + 1 : 0`.
- `receive(local: Hlc, remote: Hlc, physicalNow: number): Hlc` — on ingesting a remote stamp.
  `wall = max(local.wall, remote.wall, physicalNow)`; if `wall === local.wall === remote.wall` →
  `counter = max(local.counter, remote.counter) + 1`; else if `wall === local.wall` →
  `local.counter + 1`; else if `wall === remote.wall` → `remote.counter + 1`; else `0`.
- `compare(a: Hlc, b: Hlc): -1 | 0 | 1` — total order: by `wall`, then `counter`, then `node`
  (lexicographic tiebreak so the order is total and deterministic across devices).
- `encode(h: Hlc): string` — lexicographically-sortable: zero-padded `wall` (e.g. 15 digits) `-`
  zero-padded `counter` (e.g. 8 digits) `-` `node`. `compare(a,b)` MUST agree with
  `encode(a) < encode(b)` string comparison (assert this in tests).
- `parse(s: string): Hlc` — inverse of `encode`; round-trips.
- `initialClock(node: string): Hlc` — `{ wall: 0, counter: 0, node }`.

Counter overflow is out of scope (8 digits ≫ realistic per-ms event count); note it, don't guard.

### `packages/core/src/outbox.ts` (new) — append-only outbox primitives
Pure types + factory; persistence/acking belongs to `Repository` (the store), not core.

```ts
export type OutboxOp = 'put' | 'delete';
export type OutboxEntry = {
  id: string;          // unique entry id (uuid, supplied by caller — core stays platform-free)
  hlc: string;         // encoded Hlc stamp (ordering key)
  collection: string;  // target collection name
  recordId: string;    // id of the affected record
  op: OutboxOp;
  payload?: unknown;   // record body for 'put'; omitted for 'delete'
};
export function makeOutboxEntry(args: {
  id: string; hlc: Hlc; collection: string; recordId: string; op: OutboxOp; payload?: unknown;
}): OutboxEntry; // stamps via encode(hlc); for op:'delete' payload is dropped
```
No `crypto`/`uuid` import in core — the caller passes `id` (keeps core platform-agnostic;
invariant: core imports no platform API).

### `packages/core/src/index.ts` (edit)
Re-export the HLC and outbox surfaces (`export * from './hlc.js'; export * from './outbox.js';`).
Keep `CORE_VERSION`. Use the `.js` relative-import convention (NodeNext) already in the repo.

### `packages/core/src/tests/hlc.test.ts`, `outbox.test.ts` (new)
Unit tests in core (pure, fast). Cover: monotonic `tick` (counter increments within same ms,
resets when wall advances); `receive` merge across all four branches; `compare` totality incl.
node tiebreak; `encode`/`parse` round-trip AND `compare`↔string-order agreement (property-style:
a handful of crafted pairs is enough — no new test dep); `makeOutboxEntry` stamps `hlc` and drops
payload on delete.

### `packages/store/src/repository.ts` (new) — the contract
```ts
import type { OutboxEntry } from '@ember/core';
export type RecordBase = { id: string };
export type Predicate<T> = (rec: T) => boolean;
export interface Repository {
  put<T extends RecordBase>(collection: string, record: T): Promise<void>;
  get<T extends RecordBase>(collection: string, id: string): Promise<T | undefined>;
  query<T extends RecordBase>(collection: string, predicate?: Predicate<T>): Promise<T[]>;
  delete(collection: string, id: string): Promise<void>;
  // outbox
  enqueue(entry: OutboxEntry): Promise<void>;
  unacked(): Promise<OutboxEntry[]>;   // ascending by entry.hlc (encoded → string sort)
  ack(ids: string[]): Promise<void>;   // idempotent; unknown ids ignored
  close(): Promise<void>;
}
```
Document the contract in JSDoc: `put` is upsert; `query` with no predicate returns all in the
collection; `unacked` is HLC-ordered; `ack` removes entries from the unacked set and is idempotent.

### `packages/store/src/memory-repository.ts` (new) — in-memory reference impl
`Map<collection, Map<id, record>>` + `Map<entryId, OutboxEntry>`. Plain JS, no deps. `unacked`
sorts by `entry.hlc`. Used to (a) self-verify the conformance suite now and (b) serve as a test
double for the reconciler (unit 12). Deep-clone records on `put`/`get`/`query` (structuredClone)
so callers can't mutate stored state by reference.

### `packages/store/src/conformance.ts` (new) — shared behavioural suite
```ts
export function runRepositoryConformance(
  label: string,
  makeRepo: () => Promise<Repository>,
): void; // wraps describe(label, …)
```
Imports `describe/it/expect/beforeEach` from `vitest`. A fresh repo per test via `makeRepo`.
Assert: put→get round-trip; put upsert overwrites; get miss → `undefined`; delete removes;
query returns all then filtered by predicate; collections are isolated; enqueue→unacked returns
entries **HLC-ascending regardless of insert order**; ack removes acked entries and is idempotent
for unknown ids; records are isolated by value (mutating a returned object doesn't change the
store). This file is imported by 03b/03c tests — it exports a function, runs no tests on its own
import (no top-level `describe`).

### `packages/store/src/index.ts` (edit)
Re-export `repository.js`, `memory-repository.js`, `conformance.js`. Keep `STORE_VERSION`.

### `packages/store/src/tests/memory-repository.test.ts` (new)
`runRepositoryConformance('MemoryRepository', async () => new MemoryRepository())`. Proves the
suite and the reference impl together. (Replaces the placeholder `index.test.ts` assertion or
keeps it — either is fine; don't leave a dead test.)

## Dependencies
- none. All pure TS; `vitest` already present in both packages. No `uuid`/`crypto` in core (caller
  supplies entry ids). Dexie + `fake-indexeddb` are introduced in 03b; expo-sqlite in 03c.

## Verify when done
- [ ] HLC: `tick` monotonic, `receive` merges correctly, `compare` is a total order, and
      `encode` string-order agrees with `compare` (round-trip `parse`∘`encode` = identity).
- [ ] `MemoryRepository` passes the full `runRepositoryConformance` suite (put/get/query/delete +
      outbox enqueue/unacked-ordering/ack idempotency + value isolation).
- [ ] `conformance.ts` is importable by an external package without running tests on import.
- [ ] `packages/core` imports zero platform APIs (no React/Expo/RN/Dexie/`crypto`).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (local store is source of truth; this is
      its contract), #2 (every syncable mutation carries an HLC stamp via the outbox), and the
      core-purity boundary (System Boundaries: core has no platform APIs).

## Notes for 03b / 03c
- Both impls plug into `runRepositoryConformance` — green suite == contract satisfied.
- 03b: Dexie 4.x over IndexedDB, tested headlessly under `fake-indexeddb`. → standard.
- 03c: expo-sqlite (already a mobile dep, architecture.md); runtime verification is device-bound
  like 02d (executor lands code + green static checks; render/persistence proven on device).
- The reconciler/merge engine (push/pull, drain `unacked`) is **Unit 12**, not here. 03a only
  provides the primitives it will consume.
