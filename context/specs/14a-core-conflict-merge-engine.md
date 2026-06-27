# Unit 14a: core conflict-merge engine

Issue: #119 (umbrella #14) · Branch: feat/119-core-conflict-merge-engine · Boundary: `packages/core`
Route: **standard** — one boundary (`packages/core` + its tests), no new dependency, no UI, no
client wiring. All product forks resolved with the user (2026-06-26, below).

First slice of umbrella **#14**:
**14a** core conflict engine (this) → **14b** web conflict UI → **14c** mobile conflict UI (device-bound).

## Goal
The pure conflict "brain" that 14b/14c drive — in `packages/core`, platform-free, extending the
single shared merge engine (**invariant #5**). Documents are content-addressed (SHA-256 of bytes),
so identical files already auto-merge; this slice adds the logic for the cases that **don't**
auto-resolve:
1. **Near-duplicate detection** — same book, *different* bytes (re-export / re-scan): surface
   candidate pairs for a merge / keep-separate decision.
2. **Duplicate-decision model** — a syncable record of that decision + a canonical-id resolver so
   positions/annotations of an aliased doc route to the canonical doc.
3. **Per-file / global reading-position policy** — `furthest` (default) vs `latest`, threaded into
   the existing `applyPull` fold. **Engine only** — the settings screen is unit 17.
4. **Claim-merge planner** — pure diff producing the review payload for the *review-before-commit*
   account-claim flow.

No UI, no store change, no convex change, no new dep.

## Resolved forks (2026-06-26)
- **Conflict trigger = near-duplicate detection.** Different `docId` (different SHA) + equal
  normalized title + byte size within a band ⇒ candidate duplicate. (Identical bytes already
  auto-merge — never surfaced.)
- **Account claim = review-before-commit.** The claim flow computes a plan and the user confirms
  before the merge commits; so 14a exposes a **pure planner**, not an auto-fold. (The driving /
  applying lives in 14b/14c.)
- **14 = engine + inline prompts.** The global/per-file policy **settings screen defers to unit 17**;
  14a builds the policy *record model + fold integration* only.

## Key facts established from the code (do not re-derive)
- `Document` (`document.ts`): `{ id /*=sha256 hex*/, title, filename, byteSize, contentType,
  importedAt, pageCount? }` — **content-addressed, no `updatedAt`** (immutable bytes).
- `ReadingPosition` (`reading-position.ts`): `{ id /*=docId*/, page, offset, updatedAt /*encoded HLC*/ }`;
  `mergeReadingPosition(a,b)` = furthest-page-wins (returns a/b **by reference**).
- `applyPull(local, incoming)` (`apply-pull.ts`) is the **only** merge logic (invariant #5): a pure,
  clock-free per-entry fold. `reading-positions` → furthest-page (can emit `{kind:'correct'}`);
  every other collection → LWW by encoded HLC. The driver `reconcile.ts` executes the `PullDecision`.
- New syncable collections need **no server change**: `convex/sync.ts` `push`/`pull` are generic over
  `collection` (`v.string()`, no enum); 12a does LWW server-side; 12b's `applyPull` default is LWW.
  So `duplicate-decisions` and `conflict-policy` sync through the existing pipeline unchanged.
- Syncable records are written through the outbox with an HLC stamp where `entry.hlc ===
  payload.updatedAt` for puts (invariant #2). These two new collections follow that convention so
  they LWW-converge cross-device. **No `Repository`/store change** — they ride the generic store.

## Implementation (all in `packages/core/src`, barrel-export new symbols from `index.ts`)

### 1. Near-duplicate detection — `duplicate-detection.ts`
```ts
export function normalizeTitle(title: string): string; // lowercase, trim, collapse internal
  // whitespace to single space, strip a trailing file-extension-like token and surrounding
  // punctuation. Deterministic; pure.

export type DuplicatePair = { aId: string; bId: string }; // aId < bId lexicographically (stable)

export type DetectDuplicatesOptions = { sizeBand?: number }; // default 0.15 (±15% of the larger)

/** Pure. Candidate near-dupes among docs: distinct ids, equal normalizeTitle, and
 *  |aSize-bSize| <= sizeBand * max(aSize,bSize). Returns pairs sorted (aId,bId) ascending,
 *  deduped. O(n²) over the library is fine (libraries are small). */
export function detectDuplicates(
  docs: ReadonlyArray<Pick<Document, 'id' | 'title' | 'byteSize'>>,
  opts?: DetectDuplicatesOptions,
): DuplicatePair[];
```

### 2. Duplicate-decision model — `duplicate-decision.ts`
```ts
export const DUPLICATE_DECISIONS_COLLECTION = 'duplicate-decisions';

export type DuplicateDecision = {
  id: string;            // stable pair key `${aId}:${bId}` (aId<bId) → both devices converge (LWW)
  canonicalId: string;   // the doc kept as the merged identity (one of the pair)
  aliasId: string;       // the doc folded into canonical (the other of the pair)
  decision: 'merged' | 'separate';
  updatedAt: string;     // encoded HLC (== outbox entry hlc, invariant #2)
};

/** Pair key is order-independent so concurrent decisions on the same pair LWW-merge. */
export function duplicatePairId(aId: string, bId: string): string; // `${min}:${max}`

export function makeDuplicateDecision(args: {
  aId: string; bId: string; canonicalId: string; decision: 'merged' | 'separate'; hlc: Hlc;
}): DuplicateDecision; // validates canonicalId ∈ {aId,bId}; aliasId = the other; id = duplicatePairId

/** Resolve an alias docId to its canonical, following 'merged' decisions transitively (guard
 *  against cycles — return the input if a cycle is detected). 'separate' decisions are ignored.
 *  Pure: takes the full decision set + a docId, returns the effective canonical docId. */
export function resolveCanonicalId(
  decisions: ReadonlyArray<DuplicateDecision>,
  docId: string,
): string;
```
> 14b/14c route a doc's reading-position / annotations through `resolveCanonicalId` so a merged
> alias shows the canonical's progress; the alias doc is hidden from the Library. The *application*
> (hiding, re-pointing reads) is client work — 14a ships the pure rule + the syncable record only.

### 3. Per-file / global position policy — `conflict-policy.ts` + `apply-pull.ts` change
```ts
export const CONFLICT_POLICY_COLLECTION = 'conflict-policy';
export type PositionPolicyMode = 'furthest' | 'latest';
export const GLOBAL_POLICY_ID = 'global';

export type ConflictPolicy = {
  id: string;            // 'global' for the default, or a docId for a per-file override
  mode: PositionPolicyMode;
  updatedAt: string;     // encoded HLC
};

export function makeConflictPolicy(args: { id: string; mode: PositionPolicyMode; hlc: Hlc }): ConflictPolicy;

/** Per-file override → global default → 'furthest'. Pure. */
export function resolvePositionPolicy(
  policies: ReadonlyArray<ConflictPolicy>,
  docId: string,
): PositionPolicyMode;
```
`apply-pull.ts` change (minimal, backward-compatible):
- `applyPull(local, incoming, policy: PositionPolicyMode = 'furthest')` — third optional arg.
- In the `reading-positions` branch: if `policy === 'latest'`, **fall through to `applyLww`**
  (most-recent-write wins, no furthest-page protection, never emits `correct`). If `'furthest'`
  (default), behaviour is byte-identical to today. **No other collection consults policy.**
- `reconcile.ts` change: before folding each entry, for the `reading-positions` collection resolve
  the policy — read the `conflict-policy` records once per `reconcile` pass
  (`store.query?`… use the existing read path the driver already has; if the driver lacks a list
  method, read `GLOBAL_POLICY_ID` + the entry's `recordId` via `store.get`) and pass the resolved
  mode into `applyPull`. Default path (no policy records) stays `furthest` ⇒ all 12b tests pass
  unchanged. Policy records themselves fold via LWW like any record.

> Keep the `applyPull` signature change additive: existing 2-arg callers (and every 12b test)
> compile and behave identically because the 3rd arg defaults to `'furthest'`.

### 4. Claim-merge planner — `claim-merge.ts`
Pure diff for the review-before-commit claim. Inputs are plain projections the client gathers from
local store + the first authed pull (no transport/store import here):
```ts
export type ClaimDocSummary = Pick<Document, 'id' | 'title' | 'byteSize'>;
export type ClaimPositionSummary = { id: string; page: number };

export type ClaimMergePlan = {
  incomingDocs: string[];        // docIds remote-only → will be added to this device
  sharedDocs: string[];          // docIds on both sides (same SHA → auto, content-addressed)
  duplicateCandidates: DuplicatePair[]; // cross-side near-dupes needing a merge/separate decision
  positionReconciles: Array<{ id: string; localPage: number; remotePage: number; keptPage: number }>;
    // docs both sides have a position for, where pages differ — keptPage by furthest (transparency)
};

export function planClaimMerge(args: {
  localDocs: ReadonlyArray<ClaimDocSummary>;
  remoteDocs: ReadonlyArray<ClaimDocSummary>;
  localPositions: ReadonlyArray<ClaimPositionSummary>;
  remotePositions: ReadonlyArray<ClaimPositionSummary>;
  sizeBand?: number;
}): ClaimMergePlan;
```
- `incomingDocs`/`sharedDocs`: set diff on docId.
- `duplicateCandidates`: run the same normalized-title + size-band rule across the **union** of
  local+remote docs, but only keep pairs that straddle the two sides (a local id with a remote id) —
  same-side dupes are an in-library concern, not a claim concern.
- `positionReconciles`: for shared-or-merged docs with a position on both sides and differing pages,
  report `keptPage = max(localPage, remotePage)` (furthest). Informational — no data loss to show.
- Deterministic ordering throughout (sorted by id).

### Barrel
Export all new symbols + collection constants from `index.ts` (the constants matter — 14b/14c and
the store/outbox writers import them; mirrors `BLOB_SYNC_COLLECTION`).

## Tests (`packages/core/src/tests`, vitest, TDD — no `@ember/store` import)
- **normalizeTitle**: case/whitespace/extension/punctuation folding; idempotent.
- **detectDuplicates**: equal-title + in-band sizes → pair; out-of-band size → no pair; different
  title → no pair; identical id never pairs with itself; pairs are sorted/deduped; band boundary.
- **duplicatePairId**: order-independent (a,b)===(b,a); makeDuplicateDecision validates
  canonical∈pair, sets aliasId + id + stamped updatedAt.
- **resolveCanonicalId**: alias→canonical; transitive chain; 'separate' ignored; unknown id returns
  itself; cycle guard returns input (no infinite loop).
- **resolvePositionPolicy**: per-file override beats global beats default 'furthest'.
- **applyPull policy**: `reading-positions` with `policy='latest'` → LWW (lower-page higher-HLC
  remote **overwrites** local, **no** `correct`); with `policy='furthest'` (default & explicit) →
  byte-identical to existing furthest-page behaviour (re-assert the 12b cases); non-position
  collections ignore the policy arg.
- **planClaimMerge**: incoming/shared set diff; cross-side near-dupe surfaces, same-side does not;
  positionReconciles reports differing pages with furthest keptPage and omits equal pages;
  deterministic ordering; empty inputs → empty plan.

## Dependencies
None. No new runtime or dev dependency; `packages/core` already has vitest. No `convex/`, no
`packages/store`, no client change.

## Verify when done
- [ ] `pnpm -w typecheck` passes (core gains the new modules; no `@ember/store`/platform import in core).
- [ ] `pnpm -w test` passes (new conflict-engine suite green; **all 12b reconciler/applyPull tests
      unchanged** — the policy arg defaults to `furthest`).
- [ ] `pnpm -w lint` clean.
- [ ] **Invariant #5** — the only new merge logic lives in core (`applyPull` policy branch +
      `resolveCanonicalId` + planner); clients invent none.
- [ ] **Invariant #2** — new records carry an encoded-HLC `updatedAt`; nothing here enqueues or
      writes to Convex (pure model + planner — the client writes them through the outbox in 14b/14c).
- [ ] **Invariant #1** — pure/platform-free; no transport/store import in core.
- [ ] No `Repository` interface change, no `packages/store` change, no `convex/` change, no UI.

## Deferred (not 14a)
- **Web conflict UI (14b):** inline duplicate prompt in the Library (merge / keep-separate), the
  claim-review screen rendering `planClaimMerge`, and policy-aware library/reader wiring
  (`resolveCanonicalId` to hide aliases + route position reads; write decision/policy records
  through the outbox). UI → frontend-design / impeccable.
- **Mobile conflict UI (14c):** the same, device-bound (RN), mirroring 14b.
- **Policy settings screen** (global default + per-file override surface) → **unit 17**.
- Applying a claim plan (folding remote in after user confirmation) is a client concern (14b/14c) —
  14a only *plans*.
