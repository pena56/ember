# Unit 15a: core tags + smart-views model

Issue: #125 (umbrella #15) · Branch: feat/125-core-tags-smart-views · Boundary: `packages/core`
Route: **standard** — one boundary (`packages/core` + its tests), no new dependency, no UI, no
client wiring. Both product forks resolved with the user (2026-06-27, below).

First slice of umbrella **#15** (split by boundary like 03/04/11/12/13/14):
**15a** core tag/doc-tag/smart-view model + pure evaluator (this) → **15b** web Library tagging +
smart-view UI → **15c** mobile Library tagging + smart-view UI (device-bound).

## Goal
The pure tag/organization "model + query" layer that 15b/15c drive — in `packages/core`,
platform-free. Three new syncable record types + one pure smart-view evaluator. All three records
**ride 12a's generic `push`/`pull` (no server change)** and converge per **architecture.md:76**:
*tags union by per-item UUID; same-item edit = HLC last-write-wins.* No store change, no convex
change, no UI, no new dep.

## Resolved forks (2026-06-27)
- **Tag model = entity + UUID-keyed link records.** A `tags` record (`{id, name, color}`) PLUS
  separate `doc-tags` link records joining a doc to a tag. A global rename/recolor edits the one
  `tags` record (LWW), so it propagates everywhere; tagging/untagging creates/tombstones a link.
  (Chosen over a string-array field so rename/recolor works and merge stays per-UUID per arch:76.)
- **Smart views = user-defined saved views, syncable.** A `smart-views` record (`{id, name, query}`)
  union-merged like tags; built-in views ship as **constants** (not stored). The query = tag filter
  (all/any) + reading-state filter. The settings/management *UI* is 15b/15c — 15a is model + evaluator.

## Key facts established from the code (do not re-derive)
- `Document` (`document.ts`): `{ id /*=sha256 hex*/, title, filename, byteSize, contentType,
  importedAt /*number, ms*/, pageCount? }` — content-addressed, immutable bytes, no `updatedAt`.
- `ReadingPosition` (`reading-position.ts`): `{ id /*=docId*/, page, offset, updatedAt /*encoded HLC*/ }`.
- Mutable syncable records follow the **annotation pattern** (`annotation.ts`): a factory
  `make…(args, { hlc })` that stamps `updatedAt = encode(hlc)` (and a numeric `createdAt` the caller
  supplies — core never calls `Date.now()`/`crypto`); a pure `edit…(record, patch, { hlc })` that
  returns a fresh copy with a new `updatedAt`. **15a's tag/smart-view records mirror this exactly.**
- New syncable collections need **no server change**: `convex/sync.ts` `push`/`pull` are generic over
  `collection` (`v.string()`); 12a does server-side LWW; 12b's `applyPull` default fold is LWW. So
  `tags`, `doc-tags`, `smart-views` sync through the existing pipeline unchanged and LWW-converge.
- Outbox writes stamp `entry.hlc === payload.updatedAt` for puts (**invariant #2**); deletes drop the
  payload (tombstone). Untagging = `repo.delete(link)` + a delete outbox entry — identical to how
  annotations delete. 15b/15c do the writing; 15a only ships the pure model + ids.
- No existing doc-level reading-state predicate exists in core (`streak.ts` has a day-level "unread"
  only) — 15a defines `deriveReadingState` fresh.

## Implementation (all in `packages/core/src`, barrel-export new symbols from `index.ts`)

### 1. Tag entity — `tag.ts`
```ts
export const TAGS_COLLECTION = 'tags';

/** Fixed palette (token-friendly; 15b/15c map each to a `--color-tag-*` token). */
export type TagColor = 'gray' | 'red' | 'amber' | 'green' | 'blue' | 'purple';
export const TAG_COLORS: readonly TagColor[] = ['gray', 'red', 'amber', 'green', 'blue', 'purple'];
export const DEFAULT_TAG_COLOR: TagColor = 'gray';

export type Tag = {
  id: string;          // caller-supplied UUID
  name: string;        // display name (trimmed, internal whitespace collapsed; never empty)
  color: TagColor;
  createdAt: number;
  updatedAt: string;   // encoded HLC (== outbox entry hlc, invariant #2)
};

/** Trim, collapse internal whitespace to single spaces. Pure. (Display normalization.) */
export function normalizeTagName(name: string): string;

/** Case/space-insensitive key for dedupe ("To Read" === "to  read"). Pure. */
export function tagDedupeKey(name: string): string; // normalizeTagName(name).toLowerCase()

export function makeTag(
  args: { id: string; name: string; color?: TagColor; createdAt: number },
  ctx: { hlc: Hlc },
): Tag; // normalizes name, throws RangeError on empty-after-normalize, defaults color

export function editTag(
  tag: Tag,
  patch: { name?: string; color?: TagColor },
  ctx: { hlc: Hlc },
): Tag; // fresh copy, new updatedAt; empty-after-normalize name → RangeError; no mutation
```

### 2. Doc↔tag link — `doc-tag.ts`
```ts
export const DOC_TAGS_COLLECTION = 'doc-tags';

export type DocTag = {
  id: string;          // DETERMINISTIC: docTagId(documentId, tagId) — see below
  documentId: string;
  tagId: string;
  createdAt: number;
  updatedAt: string;   // encoded HLC
};

/** `${documentId}:${tagId}` — deterministic so the SAME (doc,tag) link converges by LWW across
 *  devices instead of forking into two UUIDs (mirrors duplicatePairId reasoning). Untag = delete
 *  this id; re-tag = same id, higher HLC ⇒ present again. Pure. */
export function docTagId(documentId: string, tagId: string): string;

export function makeDocTag(
  args: { documentId: string; tagId: string; createdAt: number },
  ctx: { hlc: Hlc },
): DocTag; // id = docTagId(...), updatedAt = encode(hlc)
```
> Union-merge is *inherent*: each link is its own UUID-keyed record (arch:76). Concurrent tags of
> different (doc,tag) pairs both survive; a concurrent tag-vs-untag of the *same* pair resolves LWW.
> 15a ships no helper for the write itself — 15b/15c call `repo.put(makeDocTag(...))` / `repo.delete`.

### 3. Smart views — `smart-view.ts`
```ts
export const SMART_VIEWS_COLLECTION = 'smart-views';

export type ReadingState = 'unread' | 'in-progress' | 'finished';

/** A saved/built-in filter. `tagIds` empty/absent ⇒ no tag constraint. `state` absent ⇒ any state. */
export type SmartViewQuery = {
  tagIds?: string[];
  tagMatch?: 'all' | 'any';   // default 'any'; only meaningful when tagIds non-empty
  state?: ReadingState;
  untaggedOnly?: boolean;     // true ⇒ only docs with zero tags (mutually exclusive w/ tagIds)
};

export type SmartView = {
  id: string;          // caller-supplied UUID
  name: string;        // trimmed, non-empty
  query: SmartViewQuery;
  createdAt: number;
  updatedAt: string;   // encoded HLC
};

export function makeSmartView(
  args: { id: string; name: string; query: SmartViewQuery; createdAt: number },
  ctx: { hlc: Hlc },
): SmartView; // normalize+validate name, validate query (untaggedOnly XOR tagIds), stamp updatedAt

export function editSmartView(
  view: SmartView,
  patch: { name?: string; query?: SmartViewQuery },
  ctx: { hlc: Hlc },
): SmartView; // fresh copy, new updatedAt, same validation

// --- Built-in views (constants, NOT stored; clients render these + the user's saved ones) ---
export type BuiltInSmartView = { key: string; name: string; query: SmartViewQuery };
export const BUILT_IN_SMART_VIEWS: readonly BuiltInSmartView[]; // 'all' (empty query), 'untagged'
  // ({untaggedOnly:true}), 'in-progress' ({state:'in-progress'}), 'finished' ({state:'finished'}),
  // 'recently-added' (empty query — ordering handled by the evaluator's recency sort, see below)
```

### 4. Reading-state + evaluator — in `smart-view.ts`
```ts
/** Pure. unread = no position; finished = pageCount known AND position.page >= pageCount;
 *  otherwise in-progress (has a position but not known-finished). */
export function deriveReadingState(
  doc: Pick<Document, 'pageCount'>,
  position: { page: number } | undefined,
): ReadingState;

/** The minimal per-doc projection the client assembles (doc ⨝ its links ⨝ its position). */
export type LibraryEntry = {
  id: string;            // documentId
  importedAt: number;
  pageCount?: number;
  tagIds: string[];      // resolved from the doc's live (non-deleted) doc-tags
  position?: { page: number };
};

/** Pure. Returns the matching documentIds, deterministically ordered: by `importedAt` DESC then
 *  `id` ASC (newest-first — matches the existing Library/`recently-added` ordering). All filters
 *  AND together: tag filter (all|any over tagIds) · untaggedOnly · state. Empty query ⇒ all docs. */
export function evaluateSmartView(
  query: SmartViewQuery,
  entries: ReadonlyArray<LibraryEntry>,
): string[];
```
> The evaluator is the single source of "what's in this view" — 15b/15c call it for both built-in
> and saved views, so a saved `{tagIds:[x], tagMatch:'all', state:'in-progress'}` and the built-in
> `Untagged` share one code path (**invariant #5**: clients invent no filtering logic).

### Barrel
Export all new symbols + the three collection constants from `index.ts` (the constants matter —
15b/15c and the store/outbox writers import them; mirrors `DUPLICATE_DECISIONS_COLLECTION`).

## Tests (`packages/core/src/tests`, vitest, TDD — no `@ember/store` import)
- **normalizeTagName / tagDedupeKey**: trim + internal-whitespace collapse; dedupe key case-folds;
  idempotent.
- **makeTag / editTag**: stamps `updatedAt`/defaults color; empty-after-normalize name → RangeError;
  `editTag` returns a fresh object (no mutation), bumps `updatedAt`, leaves `createdAt`/`id` intact.
- **docTagId / makeDocTag**: deterministic `${documentId}:${tagId}`; `make` sets id + stamped
  `updatedAt`; same (doc,tag) → same id (convergence), different pairs → different ids.
- **makeSmartView / editSmartView**: name normalize/non-empty; query validation
  (`untaggedOnly` with non-empty `tagIds` → RangeError); fresh copy + new `updatedAt` on edit.
- **deriveReadingState**: no position → `unread`; position + known pageCount, page≥count →
  `finished`; page<count → `in-progress`; position + unknown pageCount → `in-progress`
  (never finished without a count); boundary page===count → finished.
- **evaluateSmartView**:
  - empty query → all docs, newest-first (importedAt DESC, id ASC tiebreak).
  - `untaggedOnly` → only zero-tag docs.
  - `tagMatch:'any'` → docs with ≥1 of tagIds; `'all'` → docs with every tagId; default match is
    `any`.
  - `state` filter alone; combined tag+state ANDs.
  - each `BUILT_IN_SMART_VIEWS` entry evaluates to the expected set on a fixture library.
  - deterministic ordering; empty library → `[]`.

## Dependencies
None. No new runtime or dev dependency; `packages/core` already has vitest. No `convex/`, no
`packages/store`, no client change.

## Verify when done
- [ ] `pnpm -w typecheck` passes (core gains the new modules; no `@ember/store`/platform import in core).
- [ ] `pnpm -w test` passes (new tags/smart-views suite green; all prior core suites unchanged).
- [ ] `pnpm -w lint` clean.
- [ ] **architecture.md:76** — tags/links/views are UUID-keyed records that union-merge; same-item
      edits LWW via encoded-HLC `updatedAt`. No bespoke merge logic added outside the existing pipeline.
- [ ] **Invariant #5** — the only "what's in a view" logic is `evaluateSmartView` in core; clients
      invent none.
- [ ] **Invariant #2** — new records carry an encoded-HLC `updatedAt`; 15a enqueues nothing and
      writes nothing to Convex (pure model — clients write through the outbox in 15b/15c).
- [ ] **Invariant #1** — pure/platform-free; no transport/store/`Date.now()`/`crypto` import in core.
- [ ] No `Repository`/`packages/store` change, no `convex/` change, no UI.

## Deferred (not 15a)
- **Web tags + smart-views UI (15b):** tag chips on Library rows, a tag picker/create, global
  rename/recolor, the smart-view rail (built-ins + saved), a save-current-filter affordance; wire
  `evaluateSmartView` for filtering and write tag/link/view records through the outbox
  (`repo.put(make…)` / `repo.delete` for untag). UI → frontend-design / impeccable before review.
- **Mobile tags + smart-views UI (15c):** the same, device-bound (RN), mirroring 15b.
- Tag-color → token mapping (`--color-tag-*`) lands with 15b (ui-context) — 15a only names the enum.
