# Unit 15b: web Library tagging + smart-view UI

Issue: #127 (umbrella #15) · Branch: feat/127-web-library-tags-smart-views · Boundary: `apps/web`
Route: **standard** — one logic boundary (`apps/web` + its tests), consuming 15a's pure model.
Plus a small **shared design-token** addition in `packages/tokens` (the `--color-tag-*` palette,
deferred to here by 15a) — design-system vocabulary the UI consumes, forward-shared to 15c. No
`packages/store` change, no `convex/` change, no new runtime dep. **UI unit** → built with
`frontend-design`, polished with `impeccable`, then `code-review`. Product forks resolved with the
user (2026-06-28, below).

Second slice of umbrella **#15**: **15a** core model + evaluator (MERGED, #126) → **15b** web
Library tagging + smart-view UI (this) → **15c** mobile, device-bound (mirrors 15b).

## Goal
Make tags and smart views real in the **web Library**: tag chips on rows, a create/pick/manage tag
flow, a horizontal smart-view filter bar (built-ins + saved), and a save-current-filter loop — all
writing `tags` / `doc-tags` / `smart-views` records **through the existing outbox** and reading the
library through **15a's pure `evaluateSmartView`** (invariant #5: the client invents no filtering or
view-membership logic). LWW-converges across devices via 12a's generic push/pull — no server change.

## Resolved forks (2026-06-28)
- **Smart-view navigation = horizontal filter bar** (pills above the list), not a left sidebar — fits
  the existing centered `max-w-2xl` single column with minimal layout disruption. Order: the
  `BUILT_IN_SMART_VIEWS` (All · Untagged · In Progress · Finished · Recently Added) then saved views,
  then a save-current-filter affordance. The active pill drives the list via `evaluateSmartView`.
- **Tag management scope = create · tag/untag · rename · recolor · DELETE.** Deleting a tag tombstones
  the one `tags` record; its `doc-tags` links and any `smart-views.query.tagIds` referencing it become
  **inert at resolve-time** (the read path joins links against the *live* tag set and drops orphans;
  the evaluator simply never matches a missing tagId). No eager fan-out delete of links — lazy,
  convergent, cheap. Delete is behind a confirm (AlertDialog).

## Key facts established from the code (do not re-derive)
- **15a is already merged** in `@ember/core` (barrel-exported): `TAGS_COLLECTION`, `Tag`, `makeTag`,
  `editTag`, `normalizeTagName`, `tagDedupeKey`, `TagColor`, `TAG_COLORS`, `DEFAULT_TAG_COLOR`;
  `DOC_TAGS_COLLECTION`, `DocTag`, `docTagId`, `makeDocTag`; `SMART_VIEWS_COLLECTION`, `SmartView`,
  `SmartViewQuery`, `ReadingState`, `makeSmartView`, `editSmartView`, `BUILT_IN_SMART_VIEWS`,
  `BuiltInSmartView`, `deriveReadingState`, `LibraryEntry`, `evaluateSmartView`. **15b adds NO core
  logic** — it imports these.
- **Write path = inline `repo.put` + `repo.enqueue(makeOutboxEntry(...))`** in `web-store.ts`, exactly
  like `saveDuplicateDecision` (`apps/web/src/store/web-store.ts:215`). The hlc is taken ONCE per op
  (`clock.nextStamp()`) and is BOTH the record's `updatedAt` (via the 15a factory) AND the outbox
  entry's `hlc` — invariant #2. ids/`createdAt` come from the clock (`clock.newId()` / `clock.now()`);
  doc-tag ids are deterministic (`docTagId`), so do NOT mint a uuid for those.
- **Delete path = `repo.delete(collection, id)` + a `op:'delete'` outbox tombstone** (no payload).
  Copy the shape from `@ember/store`'s `deleteAnnotation` (used via `deleteAnnotationRecord` in
  `web-store.ts:200`). Untag = `repo.delete(DOC_TAGS_COLLECTION, docTagId(docId, tagId))` + tombstone.
- **Read path = `repo.query<T>(COLLECTION)`** for each collection (mirrors `listBlobStatuses` /
  `listDuplicateDecisions` at `web-store.ts:207`). The store sorts where a canonical order matters;
  view membership/order is the evaluator's job, not the store's.
- The Library already drops alias docs via `resolveCanonicalId(decisions, doc.id) === doc.id`
  (`use-library.ts:81`). **Tag/view resolution must run on the SAME canonical set** — tag a canonical
  doc, never an alias. Build `LibraryEntry[]` from the post-canonical `documents`.
- `LibraryEntry` shape the evaluator wants: `{ id, importedAt, pageCount?, tagIds, position? }`.
  `id`/`importedAt`/`pageCount` come from `Document`; `tagIds` = the doc's live doc-tags joined
  against the live tag set; `position` = `{ page }` from `listReadingPositions()` (already on the
  store, `web-store.ts:136`) keyed by docId. Omit `pageCount`/`position` when absent — never set them
  to `undefined` (tsconfig `exactOptionalPropertyTypes`, base:9).
- **Row interaction trap (already solved once, reuse it):** a `DocumentRow` is a full-row `<button>`
  open affordance under a `pointer-events-none` content layer; interactive bits inside re-enable
  `pointer-events-auto` and `e.stopPropagation()` (see the over-quota "Try again" button,
  `document-row.tsx:88`). Tag chips' remove-`×`, the "add tag" trigger, and any row menu MUST follow
  this pattern — **never nest an interactive control inside the row `<button>`**.
- shadcn primitives present: Button, Card, Sonner, Dialog, Input, Label (`apps/web/src/components/ui`).
  **Popover, Command (combobox), DropdownMenu, AlertDialog are NOT yet copied in** — add the ones you
  use via the established shadcn copy-in (Radix + Tailwind v4, mapped to Amber-Ember CSS vars, invariant
  #6). Toasts via Sonner (`toast(...)`), never inline banners. Dark mode is automatic via tokens.

## Implementation

### 0. Shared tag-color tokens — `packages/tokens/src/theme.css` (+ `theme.uniwind.css`)
Add a fixed 6-color tag palette mirroring the existing **highlight palette** precedent
(`theme.css:34`, theme-independent block in `@theme`). One semantic var per `TagColor`:
`--color-tag-gray|red|amber|green|blue|purple` (+ a paired readable foreground if a chip needs ink on
fill — prefer a single tint that reads on both light/dark like the highlight tints, else add a dark
override block). Add the same vars to `theme.uniwind.css` so **15c inherits them unchanged**. Values:
warm, muted, cozy — not saturated web-primary colors (sample the Amber-Ember mood). This is the ONLY
`packages/tokens` change; keep it to the palette. (Map: `TagColor` → `bg-tag-<color>` utility.)

### 1. Store surface — `apps/web/src/store/web-store.ts`
Add to the `WebStore` interface + factory (all via the inline put/enqueue + delete-tombstone patterns
named above; each write takes one hlc and stamps record + outbox entry from it):
- `listTags(): Promise<Tag[]>` · `listDocTags(): Promise<DocTag[]>` · `listSmartViews(): Promise<SmartView[]>` (reads, `repo.query`).
- `createTag(input: { name: string; color?: TagColor }): Promise<Tag>` — `makeTag({ id: clock.newId(), name, color?, createdAt: clock.now() }, { hlc })` → put + enqueue.
- `editTag(input: { tag: Tag; patch: { name?: string; color?: TagColor } }): Promise<Tag>` — `editTag(tag, patch, { hlc })` → put + enqueue. (rename/recolor share this.)
- `deleteTag(id: string): Promise<void>` — delete + tombstone. (Links/views referencing it go inert at resolve-time; no fan-out.)
- `tagDoc(input: { documentId: string; tagId: string }): Promise<DocTag>` — `makeDocTag({ documentId, tagId, createdAt: clock.now() }, { hlc })` → put + enqueue (id is deterministic).
- `untagDoc(input: { documentId: string; tagId: string }): Promise<void>` — `repo.delete(DOC_TAGS_COLLECTION, docTagId(documentId, tagId))` + tombstone.
- `createSmartView(input: { name: string; query: SmartViewQuery }): Promise<SmartView>` — `makeSmartView({ id: clock.newId(), name, query, createdAt: clock.now() }, { hlc })` → put + enqueue.
- `editSmartView(input: { view: SmartView; patch: { name?: string; query?: SmartViewQuery } }): Promise<SmartView>` — → put + enqueue.
- `deleteSmartView(id: string): Promise<void>` — delete + tombstone.

### 2. Library data hook — extend `apps/web/src/library/use-library.ts` (or a sibling `use-library-tags.ts`)
- Load `tags`, `doc-tags`, `smart-views`, and reading positions alongside the existing docs/statuses/
  decisions load (one `Promise.all`). Re-use the existing `loadTick`/`refresh` so every tag/view
  mutation calls `refresh()` (optimistic-after-await is fine, but a `refresh()` keeps it simple).
- Derive, on the **canonical** doc set:
  - a `Map<docId, Tag[]>` (live tags only — drop doc-tags whose `tagId` is not in the live tag set).
  - `LibraryEntry[]` for the evaluator (tagIds from that map; position from the positions map).
- Expose: `tags`, `tagsByDoc`, `smartViews`, the built-ins (`BUILT_IN_SMART_VIEWS`), the active query +
  the **filtered, ordered doc list** = `evaluateSmartView(activeQuery, entries)` mapped back to
  `DocumentWithSync` (preserve the evaluator's order — it already sorts importedAt DESC, id ASC, which
  matches today's Library order). The active-view state lives in the hook/page (not persisted).

### 3. UI (compose shadcn; `frontend-design` then `impeccable`) — `apps/web/src/library/`
- **`smart-view-bar.tsx`** — horizontal, wrapping pill row above the list. Renders built-ins then saved
  views; active pill is accented (reuse the app's accent-underline / filled-pill idiom, token-driven).
  Selecting a pill sets the active query. Saved-view pills carry a small menu (rename / delete via
  DropdownMenu + AlertDialog confirm for delete). A **"Save view"** affordance appears when the active
  query is an ad-hoc tag filter not already saved → opens a tiny name dialog → `createSmartView`.
  Empty/whitespace name rejected (the 15a factory throws `RangeError` — guard in the UI before calling,
  show gentle inline validation, don't surface the throw).
- **Tag chips on `document-row.tsx`** — render the doc's live tags as small `bg-tag-*` chips (with the
  tag name). Each chip's remove-`×` calls `untagDoc` (pointer-events-auto + stopPropagation). An
  **"add tag"** trigger (also pointer-events-auto) opens the picker. Keep the row calm — chips are
  quiet, not loud; truncate/overflow gracefully on long tag lists.
- **`tag-picker.tsx`** (Popover + Command) — search/list existing tags (dedupe display via
  `tagDedupeKey`), toggle each on/off for the doc (`tagDoc`/`untagDoc`), and **create a new tag inline**
  when the typed name has no dedupe match (pick a color from `TAG_COLORS`, default `DEFAULT_TAG_COLOR`).
  Per-tag overflow menu: rename, recolor (`editTag`), delete (`deleteTag`, confirm). Clicking a tag chip
  on a row may also set the active query to `{ tagIds: [id], tagMatch: 'any' }` (ad-hoc tag view →
  feeds the "Save view" loop) — keep this as the chip's primary click, `×` removes.
- Wire the page (`library-page.tsx`): render the bar above the list; the list now renders the
  evaluator-filtered docs; pass tag data + handlers down. Preserve existing import/dropzone/duplicate/
  storage-meter/empty-state behavior. Empty *filtered* state (a view with no matches) gets its own
  gentle copy — distinct from the no-library-at-all empty state.

### 4. Copy / voice
Warm, literary, quiet (ui-context Voice): e.g. an empty saved view → "Nothing here yet — books you tag
will gather here." Never shouty. Tag/view names are the user's words; chrome stays gentle.

## Tests (`apps/web/src/tests`, vitest + Testing Library; inject `MemoryRepository` via store-context)
Follow the existing web test setup (`use-library.test`/`library-page.test`/`use-annotations.test`
patterns — injected store, no Convex). Cover:
- **store**: each new method writes the right record + exactly one outbox entry with `entry.hlc ===
  record.updatedAt` (invariant #2); `deleteTag`/`untagDoc`/`deleteSmartView` write a `delete` tombstone
  (no payload) and remove the record; `tagDoc` uses the deterministic `docTagId` (re-tag same pair →
  same id, converges); reads return the stored records.
- **hook**: `tagsByDoc` drops orphan links (tag deleted) — a doc-tag whose tag is gone shows no chip;
  `LibraryEntry[]` built on the canonical set (alias docs excluded); active-query filtering delegates
  to `evaluateSmartView` (assert the order matches the evaluator, don't re-implement it); switching the
  active pill re-filters.
- **UI**: built-in pills render + filter (Untagged shows only zero-tag docs, In Progress/Finished by
  derived state on a fixture with positions/pageCount); creating a tag from the picker adds a chip;
  untag removes it; rename/recolor reflects globally (same tag on two docs both update); delete tag
  (after confirm) removes its chips everywhere and any pill that filtered by it matches nothing;
  Save-view persists the active tag filter and it appears as a saved pill; row open still works through
  the chips/controls (no nested-button regression — assert the open affordance + a chip `×` are
  independently clickable). Keep assertions behavior-level (roles/labels), not snapshot-brittle.

## Dependencies
None new at runtime. May copy in shadcn primitives (Popover, Command, DropdownMenu, AlertDialog) — same
Radix/Tailwind footprint already used by Dialog; these are vendored into `components/ui`, not a new
black-box dep. No `packages/store`, no `packages/core`, no `convex/` change.

## Verify when done
- [ ] `pnpm -w typecheck` passes (no explicit-`undefined` for optional `LibraryEntry` fields — omit them).
- [ ] `pnpm -w test` passes (new web suites green; all prior suites unchanged; core untouched).
- [ ] `pnpm -w lint` clean.
- [ ] **Invariant #5** — filtering/view-membership is ONLY `evaluateSmartView`; the web layer adds no
      bespoke filter/order logic (it builds `LibraryEntry[]` and reads the result).
- [ ] **Invariant #2** — every tag/doc-tag/smart-view write carries one outbox entry whose `hlc` equals
      the record's `updatedAt`; deletes enqueue a payload-less tombstone.
- [ ] **Invariant #6** — tag colors come from `--color-tag-*` tokens (+ uniwind), no hardcoded palette
      in `apps/web`; dark mode automatic.
- [ ] **architecture.md:76** — tags/links/views union by per-item id; same-item edits LWW. No server
      change; records ride 12a push/pull.
- [ ] No nested interactive controls inside the row open `<button>` (pointer-events pattern honored).
- [ ] Tag/view resolution runs on the **canonical** doc set (aliases excluded), same as today's list.

## Deferred (not 15b)
- **Mobile tags + smart-views UI (15c):** the same, device-bound (RN/uniwind), mirroring 15b; inherits
  the `--color-tag-*` tokens added here.
- Tag-color → token values may be refined by `impeccable` within this unit, but the *enum* and the
  semantic var names are fixed here for 15c parity.
- Bulk tag operations, tag drag-reorder, per-view custom sort — out of scope.
