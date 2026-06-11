# Unit 06a: ReadingPosition model + furthest-page merge + store persistence

Issue: #52 (part of umbrella Unit 06) · Branch: feat/52-reading-position-model · Boundary: packages/core + packages/store
Route: standard — shared pure-TS brain (core+store), no new dep, no UI; spec fully resolved (mirrors 04a).

First slice of Unit 06 (Reading position + resume), split COMPLEX→sub-units per the 04a/b/c & 05a/b/c
pattern: **06a** shared brain (this) → **06b** web reader capture/restore + Today "Continue Reading"
card → **06c** mobile (device-bound, WebView position bridge + native Today). 06a is fully
headless-testable; no reader, no scroll math, no UI here.

## Goal
Define the platform-agnostic reading-position layer: a `ReadingPosition` record type (page + relative
offset, keyed by document id), a `mergeReadingPosition` function that is the **first piece of the shared
conflict-merge engine** (invariant #5) implementing **furthest-page-wins**, and store
`saveReadingPosition` / `getReadingPosition` / `listReadingPositions` use-cases. Saving locally is
**last-write** (stores the literal current position — re-opening after scrolling backward resumes where
you left off); the furthest-page **merge** is a pure function the cross-device reconciler (unit 12) calls
— it is defined and tested here but not yet wired into a sync path.

## Design decisions (confirmed with user, 2026-06-11)
- **Local resume = last position; furthest-page only on merge.** `saveReadingPosition` overwrites with the
  current position (can go backward). `mergeReadingPosition` (furthest-page-wins) runs only at reconcile.
- **Merge tie-break:** furthest page wins; equal page → greater within-page offset wins; equal page AND
  offset → HLC last-write-wins (compare encoded `updatedAt`, which string-sorts in agreement with
  `compare`). Deterministic across devices ⇒ each position record carries its HLC stamp.

## Implementation

### `packages/core/src/reading-position.ts` (new)
- `export type ReadingPosition = { id: string; page: number; offset: number; updatedAt: string }`.
  - `id` = the document id (lowercase-hex SHA-256 from 04a). **One position per document** — `id` is both
    the document id and the position record's `RecordBase.id`.
  - `page` = 1-based page index (integer ≥ 1).
  - `offset` = relative position **within** the page, `0..1` (top→bottom), so it maps across viewports
    (architecture "page + relative offset (0–1)").
  - `updatedAt` = encoded HLC stamp (from `encode(hlc)`) — ordering key for the merge tie-break and
    last-write. String-sort agrees with `compare` (the `encode` invariant in `hlc.ts`).
- `export function makeReadingPosition(args: { id: string; page: number; offset: number; hlc: Hlc }): ReadingPosition`
  — pure factory. Guards: `page = Math.max(1, Math.trunc(args.page))`; `offset = clamp(args.offset, 0, 1)`
  (viewport math can produce slight over/under); `updatedAt = encode(args.hlc)`. `Hlc`/`encode` imported
  from `./hlc.js`. Core stays runtime-dep-free (no zod) — same rule as `document`/`outbox`.
- `export function mergeReadingPosition(a: ReadingPosition, b: ReadingPosition): ReadingPosition`
  — pure; returns the winning record (one of `a`/`b` by reference, not a new object):
  1. `a.page !== b.page` → the one with the **greater** page.
  2. else `a.offset !== b.offset` → the one with the **greater** offset.
  3. else → the one with the lexicographically **greater** `updatedAt` (encoded HLC); if equal, return `a`.
  - Properties (assert in tests): **commutative** (`mergeReadingPosition(a,b)` deep-equals
    `mergeReadingPosition(b,a)`) and **idempotent** (`mergeReadingPosition(a,a) === a`). This is the
    furthest-page-wins rule from architecture §Sync; the override (global/per-file) is units 14/17, NOT here.
- Re-export from `packages/core/src/index.ts` (`export * from './reading-position.js'`).

### `packages/store/src/reading-positions.ts` (new)
- `export const READING_POSITIONS_COLLECTION = 'reading-positions'`.
- `export async function saveReadingPosition(deps, input): Promise<ReadingPosition>` where
  `deps: { repo: Repository; newOutboxId: () => string; hlc: Hlc }` and
  `input: { docId: string; page: number; offset: number }`. Steps:
  1. `pos = makeReadingPosition({ id: input.docId, page: input.page, offset: input.offset, hlc: deps.hlc })`.
  2. `await repo.put(READING_POSITIONS_COLLECTION, pos)` — **upsert; last-write, NOT furthest** (re-saving
     a lower page replaces the stored record; resume-where-you-left-off).
  3. `await repo.enqueue(makeOutboxEntry({ id: deps.newOutboxId(), hlc: deps.hlc, collection: READING_POSITIONS_COLLECTION, recordId: input.docId, op: 'put', payload: pos }))`
     — one HLC-stamped outbox entry per save (invariant #2). `Hlc`/`makeOutboxEntry` from `@ember/core`;
     caller supplies `hlc` + `newOutboxId` (uuid) — core/store stay platform-free (consistent with 04a).
  4. return `pos`.
  - **Throttling is a UI concern (06b/06c), documented not enforced here:** scroll fires positions
    continuously; the reader debounces / saves on page-change so the outbox isn't flooded. The store
    contract is one record + one entry **per call**; the reconciler last-write-wins on drain.
- `export async function getReadingPosition(repo: Repository, docId: string): Promise<ReadingPosition | undefined>`
  — `repo.get<ReadingPosition>(READING_POSITIONS_COLLECTION, docId)`. Used by the reader to resume.
- `export async function listReadingPositions(repo: Repository): Promise<ReadingPosition[]>`
  — `repo.query<ReadingPosition>(READING_POSITIONS_COLLECTION)`; flat list (Today's "Continue Reading"
    sort/join-with-documents is a 06b/06c UI concern).
- Barrel-export from `packages/store/src/index.ts` (`export * from './reading-positions.js'`) — consumer
  surface only, no test-only module (Metro-safe carry-forward from 03c/04a).

### Tests
- `packages/core/src/tests/reading-position.test.ts` (fixture-based, no platform APIs):
  - `makeReadingPosition`: clamps `offset` to `[0,1]` (e.g. `1.4→1`, `-0.2→0`); floors/raises `page` to
    integer ≥ 1 (e.g. `0→1`, `3.7→3`); `updatedAt === encode(hlc)`.
  - `mergeReadingPosition`: greater page wins (both arg orders); equal page → greater offset; equal
    page+offset → greater `updatedAt`; fully equal → returns `a` (stable). **Commutative** (deep-equal
    both orders across the above cases) and **idempotent** (`merge(a,a) === a`). Build the two `Hlc`
    stamps so their encoded order is unambiguous (e.g. differing `wall`).
- `packages/store/src/tests/reading-positions.test.ts` (`MemoryRepository` + a fixed `Hlc`, monotonic
  fake `newOutboxId`):
  - save writes exactly one record + exactly one outbox entry (`recordId === docId`, `op:'put'`,
    `payload` deep-equals the returned position).
  - **last-write, not furthest:** save page 50 then save page 10 for the same doc → `getReadingPosition`
    returns page 10 (local does NOT keep the furthest); one record for the doc; two outbox entries appended.
  - `getReadingPosition` returns `undefined` for an unknown doc id.
  - `listReadingPositions` returns all saved positions across distinct docs.

## Dependencies
- none. Core stays runtime-dep-free; store adds no new dep (uses existing `@ember/core`).

## Verify when done
- [ ] `mergeReadingPosition` implements furthest-page-wins with offset→HLC tie-break; commutative + idempotent.
- [ ] `saveReadingPosition` writes one `ReadingPosition` record (id === docId) + exactly one HLC-stamped
      outbox entry; local save is last-write (re-saving a lower page replaces the stored position).
- [ ] `getReadingPosition` / `listReadingPositions` read back saved positions; unknown id → `undefined`.
- [ ] Barrel exports the consumer surface only; existing 03/04 conformance suites still green (untouched).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline, Convex never on read path),
      #2 (every syncable mutation through the outbox with an HLC stamp), #5 (cross-device merge lives in
      the shared core engine — `mergeReadingPosition` is its first piece), and core/store import no platform API.
