# Unit 12a: Convex sync server — generic mirror + push/pull

Issue: #103 (umbrella #12) · Branch: feat/103-convex-sync-server · Boundary: `convex/`
Route: standard — one boundary, well-trodden Convex fn logic, forks resolved; only new dep is the
dev-only `convex-test` harness.

First slice of umbrella **#12** (split by boundary, like 03a/b/c · 11a/b/c):
**12a** Convex sync server (this) → **12b** core reconciler + conflict-merge fold → **12c** web
reconciler wiring → **12d** mobile reconciler wiring (device-bound).

## Goal
A deployed Convex sync server that an authed user can `push` outbox entries to and `pull` changed
records from, scoped to that user. The server is a **dumb HLC-ordered canonical record store**
(generic mirror of the store `Repository`): per-key last-write-wins by encoded HLC, a per-owner
monotonic `serverSeq` for the pull cursor, ownership enforced server-side via `ctx.auth`. **No
semantic merge here** (furthest-page / union / additive all live in 12b's client-side fold) and
**no client wiring** (12c/12d).

## Resolved forks (2026-06-25)
- **Merge runs client-side.** Server stores raw records keyed by `(owner, collection, recordId)`
  with HLC-LWW; the single conflict-merge engine (invariant #5) is core's `applyPull` in 12b. Keeps
  Convex off the read path (invariant #1) and the engine in one place.
- **Generic mirror schema.** One `records` table mirroring the `OutboxEntry` shape (03a) — not
  domain-typed tables. Domain tables can specialize later when #13/#16 need them.

## Implementation

### `convex/schema.ts` — add two tables (keep `...authTables`)
```ts
records: defineTable({
  owner: v.id("users"),
  collection: v.string(),
  recordId: v.string(),
  hlc: v.string(),        // encoded HLC from the client entry; string-sort == HLC compare (03a)
  serverSeq: v.number(),  // per-owner monotonic arrival order — the "Convex re-stamp" for pull
  deleted: v.boolean(),   // tombstone (op:'delete' drops payload — outbox.ts already does this)
  doc: v.optional(v.any()),
})
  .index("by_owner_key", ["owner", "collection", "recordId"])
  .index("by_owner_seq", ["owner", "serverSeq"]),

syncState: defineTable({ owner: v.id("users"), seq: v.number() })
  .index("by_owner", ["owner"]),
```

### `convex/sync.ts` — `push` mutation
- Validate `args.entries: v.array(v.object({ id, hlc, collection, recordId, op, payload? }))` where
  `op` is `v.union(v.literal("put"), v.literal("delete"))` and `payload` is `v.optional(v.any())`.
  Mirror `OutboxEntry` exactly (entry `id` is the client outbox-entry id, used only for the ack).
- `owner = await getAuthUserId(ctx)`; **throw** if `null` (`users.ts` import precedent). Anonymous
  users are authed Convex users (unit 11) — they sync their own data; cross-user claim merge is #14.
- Load-or-create the `syncState` row for `owner`; hold its `seq` locally.
- Client sends `unacked()` already HLC-ascending; iterate in order. For each entry:
  - `existing = by_owner_key (owner, collection, recordId)`.
  - **LWW:** accept iff `!existing || entry.hlc > existing.hlc` (plain string `>`; encoded HLC sorts
    correctly). On accept: `seq += 1`; patch existing (or insert) with
    `{ hlc, serverSeq: seq, deleted: op === "delete", doc: op === "put" ? payload : undefined }`.
  - Push `entry.id` to `acked` **whether or not it won LWW** — a superseded entry is still
    incorporated, so the client must be free to drop it from its outbox.
- Persist `syncState.seq = seq`. Return `{ acked: string[] }`.

### `convex/sync.ts` — `pull` query
- Args: `{ cursor: v.number(), limit: v.optional(v.number()) }`.
- `owner = getAuthUserId(ctx)`; **throw** if `null`.
- `by_owner_seq` where `owner === userId && serverSeq > cursor`, ascending, `.take(limit ?? 200)`.
- Map each row → `{ collection, recordId, hlc, op: deleted ? "delete" : "put", payload: doc, serverSeq }`.
- Return `{ entries, cursor: entries.length ? entries.at(-1).serverSeq : cursor }`.

### Ownership isolation
Every row carries `owner`; both fns derive `owner` from `ctx.auth` and only ever touch their own
rows. A user can never read or overwrite another user's records (architecture: ownership enforced
server-side at push time). This is invariant #1's server complement and the property unit 11 set up.

## Dependencies
- `convex-test@0.0.53` (devDependency, `convex/`) — headless Convex fn testing. Verify the exact
  version with `npm view convex-test version` at install (it tracks the `convex` minor).
- `@edge-runtime/vm` (devDependency) — `convex-test` runs under the `edge-runtime` vitest
  environment; install the version its peer range asks for. Add a vitest project/env for `convex/`
  with `environment: "edge-runtime"`.
- No runtime dep: `convex@1.40.0`, `@convex-dev/auth@0.0.94` already pinned. No core/store/client change.

## Verify when done
- [ ] Authed `push` inserts a new record; re-`push` with a **lower** HLC is rejected (LWW), with a
      **higher** HLC wins; `op:"delete"` writes a tombstone (`deleted: true`, no `doc`).
- [ ] `push` returns every submitted entry id in `acked` (incl. LWW-superseded ones).
- [ ] `pull(cursor)` returns only `serverSeq > cursor`, ascending, and advances the cursor;
      `pull` from `0` after several pushes replays all of the user's records in order.
- [ ] User B's `pull` never returns User A's rows; unauthenticated `push`/`pull` throw.
- [ ] `pnpm -w typecheck` passes (Convex `v`-validated args; `@convex-dev/eslint-plugin` clean)
- [ ] `pnpm -w test` passes (new `convex/` `convex-test` suite)
- [ ] `pnpm -w lint` clean
- [ ] No invariant violated — esp. **#2** (server never bypasses the outbox: it only ingests pushed
      outbox entries), **#5** (no semantic merge logic added here; that is 12b), **#1** (Convex stays
      off the read path — clients keep functioning offline).

## Deferred to 12b (do NOT solve here)
- The **furthest-page** position rule is lossy under naive server HLC-LWW (a later-but-earlier-page
  write would supersede a further page at the canonical store). 12a stores positions like any record;
  12b's client fold (and/or deriving furthest page from the additive session log, invariant #3) is
  where furthest-page is made correct. Flag, don't fix.
- The reconciler loop, ack-after-push wiring, and `applyPull` fold are 12b.

## USER deploy gate (deployment-bound, before merge)
`npx convex dev --once` in repo root (or `pnpm --filter @ember/convex …`) to push the `records` +
`syncState` schema to dev `necessary-warbler-246` — no headless substitute for a real schema push,
same gate class as 11a. Confirm the deploy is clean and the two tables appear in the dashboard.
