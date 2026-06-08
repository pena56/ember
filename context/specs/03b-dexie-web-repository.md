# Unit 03b: Dexie/web `Repository` implementation

Issue: #29 · Branch: feat/29-dexie-web-repository · Boundary: `packages/store` (web impl)
Route: standard — one boundary; contract + conformance suite already exist (03a). Dexie is
pre-pinned in architecture.md (4.4.3) and tested headlessly under `fake-indexeddb`, so the one
new dep carries no ambiguity. Second slice of split Unit 03 (03a ✓ → **03b** → 03c).

## Goal
A `DexieRepository` (IndexedDB-backed, web) implementing the existing `Repository` interface and
passing the full `runRepositoryConformance` suite headlessly under `fake-indexeddb`. No app wiring,
no reconciler — just the persistence impl + its conformance test. `pnpm -w test` stays green.

## Implementation

### `packages/store/src/dexie-repository.ts` (new) — IndexedDB impl
A class `DexieRepository implements Repository` (from `./repository.js`) backed by a Dexie
database. Mirror `MemoryRepository`'s observable behaviour exactly — the conformance suite is the
spec.

Schema / store layout (one DB per instance):
- **Records:** a single Dexie table keyed by a compound `[collection+id]` so arbitrary collection
  names work without a schema migration per collection. Store rows as
  `{ collection: string, id: string, record: RecordBase }`. Primary key = `[collection+id]`;
  add an index on `collection` so `query(collection)` is a `.where('collection').equals(...)` scan.
- **Outbox:** a table `outbox` keyed by `id`, with the row = the `OutboxEntry` itself, and an
  index on `hlc` so `unacked()` reads ascending via `.orderBy('hlc')`.

Method mapping (honour the JSDoc contract on `Repository`):
- `put(collection, record)` — **deep-clone the input with `structuredClone` before storing**
  (value isolation: mutating the caller's object after `put` must not change the store), then
  `table.put({ collection, id: record.id, record: cloned })` (Dexie `put` is upsert → matches).
- `get(collection, id)` — fetch by `[collection+id]`; return `structuredClone(row.record)` or
  `undefined`. (Clone on read too — defensive; structuredClone on the way out guarantees value
  isolation even if Dexie hands back a live reference.)
- `query(collection, predicate?)` — `.where('collection').equals(collection).toArray()`, map to
  `structuredClone(row.record)`, then apply `predicate` if given. Order is not contractually
  guaranteed (the suite sorts ids), so no orderBy needed here.
- `delete(collection, id)` — delete by `[collection+id]`.
- `enqueue(entry)` — `outbox.put(structuredClone(entry))` (entry already carries encoded `hlc`).
- `unacked()` — `outbox.orderBy('hlc').toArray()`. Encoded HLC is a lexicographically sortable
  string (03a guarantee), so IndexedDB string ordering == HLC ascending. Return clones.
- `ack(ids)` — `outbox.bulkDelete(ids)` inside a transaction; idempotent (Dexie ignores missing
  keys). Empty array → no-op.
- `close()` — `db.close()`.

Constructor: accept a database name (`new DexieRepository(name = 'ember')`) so each test gets an
isolated DB. **Do not** import `fake-indexeddb` here — the impl uses the ambient global
`indexedDB`; the test harness supplies the fake (see vitest setup). Use the `.js` relative-import
convention (NodeNext) already in the repo.

Type note: Dexie tables are generic; type the records table row explicitly and keep the public
methods generic over `T extends RecordBase` exactly as the interface declares. Don't widen the
interface.

### `packages/store/src/index.ts` (edit)
Add `export * from './dexie-repository.js';`. Keep existing exports + `STORE_VERSION`.

### `packages/store/vitest.config.ts` (edit) — headless IndexedDB
Register `fake-indexeddb/auto` so `indexedDB` is a global before tests run. Add a setup file
(e.g. `src/tests/setup.ts` containing `import 'fake-indexeddb/auto';`) and wire it via
`test.setupFiles: ['src/tests/setup.ts']`. Keep `include: ['src/**/*.test.ts']`.

### `packages/store/src/tests/dexie-repository.test.ts` (new)
```ts
import { runRepositoryConformance } from '../conformance.js';
import { DexieRepository } from '../dexie-repository.js';
// unique db name per repo so tests don't share IndexedDB state
runRepositoryConformance('DexieRepository', async () => new DexieRepository(`ember-test-${crypto.randomUUID()}`));
```
The existing `MemoryRepository` conformance run stays — both impls prove the same suite.
If `fake-indexeddb` retains data across `makeRepo` calls within the process, the unique db name
per call guarantees isolation; if any residue is observed, additionally `await db.delete()`-then-
recreate or clear tables in the constructor — but prefer the unique-name approach first.

## Dependencies
- `dexie@4.4.3` (runtime dep — web IndexedDB store; the version pinned in architecture.md).
- `fake-indexeddb@6.2.5` (devDependency — headless IndexedDB for vitest; no browser/jsdom needed).
Install just-in-time into `packages/store` with pnpm (`pnpm --filter @ember/store add dexie@4.4.3`
and `… add -D fake-indexeddb@6.2.5`).

## Verify when done
- [ ] `DexieRepository` passes the **full** `runRepositoryConformance` suite under `fake-indexeddb`
      (put/get/query/delete + collection isolation + value isolation + outbox enqueue/unacked
      HLC-ordering/ack idempotency/empty-ack no-op).
- [ ] `unacked()` returns entries HLC-ascending via the `hlc` index regardless of insert order.
- [ ] Value isolation holds: mutating an input after `put`, or a record returned by `get`/`query`,
      does not change stored state (structuredClone on write + read).
- [ ] `MemoryRepository` conformance run still green (no regression).
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (this is the web on-device source of
      truth) and #2 (outbox carries the HLC stamp; impl preserves ordering). `packages/core`
      gains no new import (Dexie lives only in `packages/store`).

## Notes
- The conformance suite is the contract; do not edit `conformance.ts` to make Dexie pass. If a real
  contract gap surfaces, flag it — don't weaken the suite.
- 03c (expo-sqlite, mobile) is the remaining slice and is device-bound like 02d; not in scope here.
- The reconciler that drains `unacked()` is Unit 12, not here.
