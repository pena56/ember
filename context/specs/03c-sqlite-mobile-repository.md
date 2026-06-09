# Unit 03c: SQLite/mobile `Repository` implementation

Issue: #31 · Branch: feat/31-sqlite-mobile-repository · Boundary: `packages/store` (SQLite impl) + thin device-verified adapter in `apps/mobile`
Route: standard — one boundary of real logic (`packages/store`); the SQL logic is tested in CI
via a `node:sqlite` driver binding, the native `expo-sqlite` binding is a ~15-line adapter
verified on device (like 02d). Third slice of split Unit 03 (03a ✓ → 03b ✓ → **03c**).

## Goal
A `SqliteRepository` implementing the existing `Repository` interface (JSON-text rows in SQLite),
talking to a tiny async `SqliteDriver` port instead of any concrete SQLite library. It passes the
**full** `runRepositoryConformance` suite headlessly in CI through a `node:sqlite` driver binding.
A thin `expoSqliteDriver` adapter (in `apps/mobile`) wires the same repository to `expo-sqlite` on
device, proven once via a throwaway smoke check. No reconciler, no production UI wiring.

## Why a driver port (read first)
`expo-sqlite` is a native module — it cannot load under vitest/node, so (unlike 03b's
`fake-indexeddb` trick) the conformance suite can't exercise it directly in CI. We therefore split
the seam:
- **`SqliteRepository`** holds all SQL/JSON logic and depends only on the `SqliteDriver` port.
- **`nodeSqliteDriver`** (Node's built-in `node:sqlite`, available here — Node 24) backs the
  conformance run in CI → the real SQL is fully tested headlessly, no new dependency.
- **`expoSqliteDriver`** is the thin native binding, the *only* file importing `expo-sqlite`,
  isolated in `apps/mobile` so node tests never load it; correctness is proven on device.

## Implementation

### `packages/store/src/sqlite-driver.ts` (new) — the port
Define the minimal async surface both drivers satisfy. Keep it tiny — only what the repository
needs. SQL placeholders are positional `?`.
```ts
export type SqlValue = string | number | null;
export interface SqliteDriver {
  /** Run DDL / statements with no bound params (may contain multiple statements). */
  exec(sql: string): Promise<void>;
  /** Run a single write statement with positional params. */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Run a SELECT and return rows. */
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Release the underlying connection. */
  close(): Promise<void>;
}
```

### `packages/store/src/sqlite-repository.ts` (new) — port-based impl
`class SqliteRepository implements Repository`, constructed from a `SqliteDriver`. Mirror
`DexieRepository`'s observable behaviour exactly — the conformance suite is the spec.

DDL must run before first use, and constructors can't be async, so expose a static async factory
and keep the constructor private:
```ts
static async create(driver: SqliteDriver): Promise<SqliteRepository> {
  await driver.exec(`
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, hlc TEXT NOT NULL, entry TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_hlc ON outbox (hlc);
  `);
  return new SqliteRepository(driver);
}
```
Storage layout & method mapping (records and outbox payloads stored as JSON text — `JSON.parse`
on read gives value isolation for free, no `structuredClone` needed):
- `put` — `INSERT OR REPLACE INTO records (collection,id,record) VALUES (?,?,?)` with
  `JSON.stringify(record)`. (`INSERT OR REPLACE` = upsert.)
- `get` — `SELECT record FROM records WHERE collection=? AND id=?`; `JSON.parse` the one row or
  return `undefined`.
- `query` — `SELECT record FROM records WHERE collection=?`; map `JSON.parse`, then apply
  `predicate` if given. (Order not contractually guaranteed; the suite sorts ids.)
- `delete` — `DELETE FROM records WHERE collection=? AND id=?`.
- `enqueue` — `INSERT OR REPLACE INTO outbox (id,hlc,entry) VALUES (?,?,?)`, storing
  `entry.hlc` in the `hlc` column and `JSON.stringify(entry)` in `entry`.
- `unacked` — `SELECT entry FROM outbox ORDER BY hlc ASC`; `JSON.parse` each. SQLite's default
  BINARY collation on TEXT == lexicographic == HLC-ascending (encoded HLC is a sortable string —
  03a guarantee), matching Dexie's `hlc`-index behaviour.
- `ack(ids)` — empty array → no-op (return early). Else
  `DELETE FROM outbox WHERE id IN (?,?,…)` with one `?` per id; missing ids are silently ignored
  → idempotent.
- `close` — `driver.close()`.

Type the SELECT rows explicitly (e.g. `{ record: string }`, `{ entry: string }`) and keep public
methods generic over `T extends RecordBase` exactly as the interface declares. Use the `.js`
relative-import convention (NodeNext). `OutboxEntry` from `@ember/core`.

### `packages/store/src/node-sqlite-driver.ts` (new) — CI/test binding
Wrap Node's built-in `node:sqlite` (`DatabaseSync`, synchronous → wrap in async). Default to an
in-memory db so each conformance run is isolated:
```ts
import { DatabaseSync } from 'node:sqlite';
export function nodeSqliteDriver(filename = ':memory:'): SqliteDriver {
  const db = new DatabaseSync(filename);
  return {
    async exec(sql) { db.exec(sql); },
    async run(sql, params = []) { db.prepare(sql).run(...params); },
    async all(sql, params = []) { return db.prepare(sql).all(...params) as never; },
    async close() { db.close(); },
  };
}
```
`node:sqlite` is experimental and prints a runtime warning — that's expected and harmless under
vitest. Types ship with `@types/node` (25.x present). Add `@types/node` as a devDependency of
`packages/store` if `tsc --noEmit` can't resolve `node:sqlite`/`DatabaseSync`.

### `packages/store/src/index.ts` (edit)
Add `export * from './sqlite-driver.js';`, `export * from './sqlite-repository.js';`, and
`export * from './node-sqlite-driver.js';`. **Do NOT export the expo binding from the barrel** —
it lives in `apps/mobile` and must never be loaded by node tests. Keep existing exports +
`STORE_VERSION`.

### `packages/store/src/tests/sqlite-repository.test.ts` (new)
```ts
import { runRepositoryConformance } from '../conformance.js';
import { nodeSqliteDriver } from '../node-sqlite-driver.js';
import { SqliteRepository } from '../sqlite-repository.js';

runRepositoryConformance('SqliteRepository', () =>
  SqliteRepository.create(nodeSqliteDriver()), // fresh :memory: db per repo
);
```
The existing `MemoryRepository` and `DexieRepository` conformance runs stay — all three impls
prove the same suite.

### `apps/mobile` — thin `expoSqliteDriver` adapter (DEVICE-BOUND)
The native binding lives here, not in `packages/store`, because this is where `expo-sqlite` and the
RN type environment already resolve (architecture: `apps/mobile` = platform glue). Add
`"@ember/store": "workspace:*"` to `apps/mobile/package.json`.

`apps/mobile/src/store/expo-sqlite-driver.ts` (new) — implements the `SqliteDriver` port from
`@ember/store` over `expo-sqlite`'s async API:
```ts
import { openDatabaseAsync } from 'expo-sqlite';
import type { SqliteDriver } from '@ember/store';
export async function expoSqliteDriver(name = 'ember.db'): Promise<SqliteDriver> {
  const db = await openDatabaseAsync(name);
  return {
    async exec(sql) { await db.execAsync(sql); },
    async run(sql, params = []) { await db.runAsync(sql, params); },
    async all(sql, params = []) { return db.getAllAsync(sql, params); },
    async close() { await db.closeAsync(); },
  };
}
```
Then `const repo = await SqliteRepository.create(await expoSqliteDriver())`. Keep the on-device
verification a **throwaway smoke** (a dev-only screen or a guarded effect that runs a
put→get→query→enqueue→unacked→ack sequence and logs the results) — NOT production UI wiring. Real
store wiring lands with the entity units (04/07/10). Remove or clearly mark the smoke as dev-only
before merge.

## Dependencies
- **None new in `packages/store`** — `node:sqlite` is built into Node 24 (no install); add
  `@types/node` (devDependency, latest 25.x) only if needed for `tsc` to see `node:sqlite`.
- **`apps/mobile`** — `@ember/store` (`workspace:*`); `expo-sqlite@56.0.4` already installed.
  Do not add `expo-sqlite` to `packages/store`.

## Verify when done
- [ ] `SqliteRepository` passes the **full** `runRepositoryConformance` suite via `nodeSqliteDriver`
      (put/get/query/delete + collection isolation + value isolation + outbox enqueue/unacked
      HLC-ordering/ack idempotency/empty-ack no-op).
- [ ] `unacked()` returns entries HLC-ascending via `ORDER BY hlc` regardless of insert order.
- [ ] Value isolation holds (JSON round-trip): mutating an input after `put`, or a record returned
      by `get`/`query`, does not change stored state.
- [ ] `MemoryRepository` and `DexieRepository` conformance runs still green (no regression).
- [ ] `expo-sqlite` is imported in **exactly one** file (`apps/mobile/.../expo-sqlite-driver.ts`)
      and is **not** reachable from `packages/store`'s barrel or any node test.
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean.
- [ ] No invariant in architecture.md violated — esp. #1 (mobile on-device source of truth) and
      #2 (outbox carries the HLC stamp; impl preserves ordering). `packages/core` gains no import.
- [ ] **DEVICE-BOUND (user, before merge):** `npx expo start` in `apps/mobile`, run the smoke once
      → put/get/query round-trip, outbox enqueue→unacked HLC order, ack removal all behave; data
      persists across an app reload (proves real SQLite persistence, not just in-memory).

## Notes
- The conformance suite is the contract — do **not** edit `conformance.ts` to make SQLite pass.
  If a real contract gap surfaces, flag it; don't weaken the suite.
- **Bundle the deferred close()-coverage micro-unit here** (from 03b notes): add
  `afterEach(() => repo.close())` + an idempotent-close assertion to `conformance.ts`, so all three
  impls (Memory/Dexie/Sqlite) exercise `close()`. It's against the shared 03a suite; landing it in
  this PR is fine since this unit already adds a third impl — call it out in the PR body.
- The reconciler that drains `unacked()` is Unit 12, not here.
