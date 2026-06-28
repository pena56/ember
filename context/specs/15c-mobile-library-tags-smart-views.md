# Unit 15c: mobile Library tagging + smart-view UI

Issue: #129 (umbrella #15) · Branch: feat/129-mobile-library-tags-smart-views · Boundary: `apps/mobile`
Route: **standard** — one logic boundary (`apps/mobile` + its tests), a device-bound mirror of the merged
15b web slice. Consumes 15a's pure model; adds NO core logic; no `packages/tokens` change (15b already
added `--color-tag-*` to `theme.uniwind.css`); no `packages/store` / `convex/` change; no new runtime dep.
**UI unit** → built with `frontend-design`, polished with `impeccable`, then `code-review`. Product forks
were resolved with the user in 15b (2026-06-28) and carry over unchanged — this is the 14b→14c precedent.

Third (final) slice of umbrella **#15**: **15a** core model + evaluator (MERGED, #126) → **15b** web Library
tagging + smart-view UI (MERGED, #128) → **15c** mobile, device-bound (this) — mirrors 15b.

## Goal
Make tags and smart views real in the **mobile Library** (Expo RN / uniwind): tag chips on rows, a
create/pick/manage tag flow, a horizontal smart-view filter bar (built-ins + saved), and a
save-current-filter loop — all writing `tags` / `doc-tags` / `smart-views` records **through the existing
outbox** in `native-store.ts` and reading the library through **15a's pure `evaluateSmartView`** (invariant
#5: the client invents no filtering or view-membership logic). LWW-converges across devices via 12a's
generic push/pull — no server change. Feature parity with 15b, native-idiomatic presentation.

## Inherited forks (resolved in 15b — do NOT re-litigate)
- **Smart-view navigation = horizontal filter bar** (a horizontal pill row above the list), not a sidebar.
  Order: `BUILT_IN_SMART_VIEWS` (All · Untagged · In Progress · Finished · Recently Added) then saved views,
  then a save-current-filter affordance. The active pill drives the list via `evaluateSmartView`.
- **Tag management = create · tag/untag · rename · recolor · DELETE.** Deleting a tag tombstones the one
  `tags` record; its `doc-tags` links and any `smart-views.query.tagIds` referencing it become **inert at
  resolve-time** (the read path joins links against the *live* tag set and drops orphans; the evaluator
  never matches a missing tagId). No eager fan-out delete. Delete is behind a confirm.

## Key facts established from the code (do not re-derive)
- **15a is merged** in `@ember/core` (barrel-exported): `TAGS_COLLECTION`, `Tag`, `makeTag`, `editTag`,
  `normalizeTagName`, `tagDedupeKey`, `TagColor`, `TAG_COLORS`, `DEFAULT_TAG_COLOR`; `DOC_TAGS_COLLECTION`,
  `DocTag`, `docTagId`, `makeDocTag`; `SMART_VIEWS_COLLECTION`, `SmartView`, `SmartViewQuery`, `ReadingState`,
  `makeSmartView`, `editSmartView`, `BUILT_IN_SMART_VIEWS`, `BuiltInSmartView`, `deriveReadingState`,
  `LibraryEntry`, `evaluateSmartView`. **15c adds NO core logic** — it imports these. (15b's web layer is the
  reference implementation; port its shapes, do not re-invent.)
- **Write path = inline `repo.put` + `repo.enqueue(makeOutboxEntry(...))`** in `native-store.ts`, exactly
  like `saveDuplicateDecision` (`apps/mobile/src/store/native-store.ts:260`). The hlc is taken ONCE per op
  (`clock.nextStamp()`) and is BOTH the record's `updatedAt` (via the 15a factory) AND the outbox entry's
  `hlc` — invariant #2. Pass the raw `Hlc` to both (do NOT pre-encode). ids/`createdAt` come from the clock
  (`clock.newId()` / `clock.now()`); doc-tag ids are deterministic (`docTagId`), so do NOT mint a uuid.
- **Delete path = inline `repo.delete(collection, id)` + a payload-less `op:'delete'` outbox tombstone.**
  `native-store` has no generic delete helper exposed for these collections (15a was pure core), so write it
  inline: `await repo.delete(COLLECTION, id); await repo.enqueue(makeOutboxEntry({ id: clock.newOutboxId(),
  hlc, collection: COLLECTION, recordId: id, op: 'delete' }))` — same tombstone shape `deleteAnnotation`
  produces. Untag = `repo.delete(DOC_TAGS_COLLECTION, docTagId(documentId, tagId))` + tombstone.
- **Read path = `repo.query<T>(COLLECTION)`** per collection (mirrors `listBlobStatuses` /
  `listDuplicateDecisions`, `native-store.ts:249/256`). View membership/order is the evaluator's job.
- The Library already drops alias docs via `resolveCanonicalId(decisions, doc.id) === doc.id`
  (`use-library.ts:86`). **Tag/view resolution must run on the SAME canonical set** — tag a canonical doc,
  never an alias. Build `LibraryEntry[]` from the post-canonical documents.
- `LibraryEntry` shape: `{ id, importedAt, pageCount?, tagIds, position? }`. `id`/`importedAt`/`pageCount`
  from `Document`; `tagIds` = the doc's live doc-tags joined against the live tag set; `position` =
  `{ page }` from `listReadingPositions()` (`native-store.ts:173`) keyed by docId. Omit `pageCount`/
  `position` when absent — never set them to `undefined` (tsconfig `exactOptionalPropertyTypes`).
- **Row interaction (RN):** `DocumentRow` is one `Pressable` that navigates via `useRouter()`
  (`document-row.tsx:123`). Nested `Pressable`s are valid in RN, but interactive tag controls MUST
  `e.stopPropagation()` so a chip/×/add-tag tap doesn't also open the reader (the "Try again" badge does
  exactly this, `document-row.tsx:91`). a11y: the row is currently a single spoken element with decorative
  children hidden; the new tag chips / add-tag / × are **real controls** — give each its own
  `accessibilityRole="button"` + `accessibilityLabel` (do not hide them), and pad hit areas (`hitSlop`) to a
  comfortable target like the retry control.
- **Presentation primitives (no new dep):** the tag picker uses RN `Modal` — mirror the
  `annotation-editor.tsx` sheet pattern (warm card, swatch row, `TextInput`, pressed-opacity, token-only).
  The smart-view bar is a horizontal `ScrollView` of `Pressable` pills; the active pill reuses the
  **accent-underline** idiom from `ThemeControl` (`library-screen.tsx:48`, `border-b-2 border-accent`). RN
  has no DropdownMenu — a saved pill's manage menu and per-tag manage actions are small `Modal`/inline
  action rows with a confirm for delete. `react-native-svg` is available for the × / + glyphs.
- **Tag colors are already tokenized** (15b): `--color-tag-{gray,red,amber,green,blue,purple}` exist in
  `packages/tokens/src/theme.uniwind.css`. Use a literal `bg-tag-*` **safelist map** (`Record<TagColor,
  string>`, exactly like `SWATCH_CLASS` in `annotation-editor.tsx:58`) so uniwind statically sees the
  classes. **No `packages/tokens` change in 15c.** No hardcoded palette (invariant #6).
- Toasts via `sonner-native` (`toast(...)`), as `use-library.ts` already does.

## Implementation

### 1. Store surface — `apps/mobile/src/store/native-store.ts`
Add to the `NativeStore` interface + factory — the SAME 9 methods 15b added to `web-store`, via the inline
put/enqueue + delete-tombstone patterns above (each write takes one `hlc = clock.nextStamp()` stamping
record + outbox entry):
- `listTags(): Promise<Tag[]>` · `listDocTags(): Promise<DocTag[]>` · `listSmartViews(): Promise<SmartView[]>` (`repo.query`).
- `createTag(input: { name: string; color?: TagColor }): Promise<Tag>` — `makeTag({ id: clock.newId(), name, color?, createdAt: clock.now() }, { hlc })` → put + enqueue.
- `editTag(input: { tag: Tag; patch: { name?: string; color?: TagColor } }): Promise<Tag>` — `editTag(tag, patch, { hlc })` → put + enqueue (rename/recolor share this).
- `deleteTag(id: string): Promise<void>` — delete + tombstone (links/views referencing it go inert at resolve-time; no fan-out).
- `tagDoc(input: { documentId: string; tagId: string }): Promise<DocTag>` — `makeDocTag({ documentId, tagId, createdAt: clock.now() }, { hlc })` → put + enqueue (deterministic id).
- `untagDoc(input: { documentId: string; tagId: string }): Promise<void>` — `repo.delete(DOC_TAGS_COLLECTION, docTagId(documentId, tagId))` + tombstone.
- `createSmartView(input: { name: string; query: SmartViewQuery }): Promise<SmartView>` — `makeSmartView({ id: clock.newId(), name, query, createdAt: clock.now() }, { hlc })` → put + enqueue.
- `editSmartView(input: { view: SmartView; patch: { name?: string; query?: SmartViewQuery } }): Promise<SmartView>` — → put + enqueue.
- `deleteSmartView(id: string): Promise<void>` — delete + tombstone.

Import the new factories/collections from `@ember/core` alongside the existing imports.

### 2. Library data hook — `apps/mobile/src/library/use-library-tags.ts` (sibling, mirrors web)
Port 15b's `use-library-tags.ts` to RN (same shape; swap `useNativeStore` for the store accessor and keep the
`loadTick`/`refresh` + `blobChange` subscription already in `use-library.ts`):
- One `Promise.all` loads `listDocuments` / `listBlobStatuses` / `listDuplicateDecisions` / `listTags` /
  `listDocTags` / `listSmartViews` / `listReadingPositions`. Every tag/view mutation calls `refresh()`.
- Derive on the **canonical** doc set: a `Map<docId, Tag[]>` (live tags only — drop doc-tags whose `tagId`
  is not in the live tag set), and `LibraryEntry[]` for the evaluator (tagIds from that map; position from
  the positions map; omit absent optional fields).
- Expose: `tags`, `tagsByDoc`, `smartViews`, `BUILT_IN_SMART_VIEWS`, `totalDocCount`, the active query/view
  state, and the **filtered, ordered** doc list = `evaluateSmartView(activeQuery, entries)` mapped back to
  `DocumentWithSync` (preserve the evaluator's order — it sorts importedAt DESC, id ASC, matching today's
  list). Active-view state lives in the hook/screen (not persisted). Keep `pickAndImport` available to the
  screen (compose/re-export from `useLibrary`, or fold the import path in — match how 15b wired it).

### 3. UI (compose RN + uniwind; `frontend-design` then `impeccable`) — `apps/mobile/src/library/`
- **`smart-view-bar.tsx`** — a horizontal `ScrollView` (`horizontal`, `showsHorizontalScrollIndicator={false}`)
  of pill `Pressable`s rendered in the `FlatList` `ListHeaderComponent` (above the title or just under it).
  Built-ins then saved views; the active pill uses the accent-underline idiom (`border-b-2 border-accent`)
  or a filled-pill, token-driven. Selecting a pill sets the active query. Saved-view pills expose a manage
  affordance (long-press or a small ⋯) → a `Modal`/inline sheet: **rename** / **delete** (confirm). A
  **"Save view"** affordance appears when the active query is an ad-hoc tag filter not already saved → tiny
  name `Modal` → `createSmartView`. Empty/whitespace name rejected before calling the factory (it throws
  `RangeError`) — show gentle inline validation, don't surface the throw. Each pill carries
  `accessibilityRole="button"` + `accessibilityState={{ selected }}`.
- **Tag chips on `document-row.tsx`** — render the doc's live tags as small `bg-tag-*` chips (via the
  `TAG_BG` safelist map) with the tag name, in a wrapping row below the meta line. Each chip is a `Pressable`:
  primary press sets the active query to `{ tagIds: [id], tagMatch: 'any' }` (ad-hoc tag view → feeds the
  "Save view" loop); a trailing `×` `Pressable` calls `untagDoc`. Both `stopPropagation` so the row doesn't
  navigate. An **"add tag"** `Pressable` (＋) opens the picker. Each control gets its own
  `accessibilityRole`/`accessibilityLabel` + `hitSlop`. Keep the row calm — chips quiet, wrap/truncate
  gracefully on long lists. (DocumentRow will need tag data + handlers; thread them from the screen via
  `renderRow` rather than reading the store inside the row.)
- **`tag-picker.tsx`** (RN `Modal`, mirror `annotation-editor`) — a search `TextInput`, a scrollable list of
  existing tags (dedupe display via `tagDedupeKey`) each toggleable on/off for the doc (`tagDoc`/`untagDoc`,
  show applied state), and **inline create** when the typed name has no dedupe match (color from
  `TAG_COLORS`, default `DEFAULT_TAG_COLOR` — a small swatch row like `annotation-editor`). Per-tag manage:
  rename, recolor (`editTag`), delete (`deleteTag`, confirm). Warm sheet styling, pressed-opacity, token-only.
- Wire the screen (`library-screen.tsx`): use `useLibraryTags`; render `<SmartViewBar>` in the list header;
  the `FlatList` `data` is now the evaluator-filtered list; pass tag data + handlers into `renderRow`.
  Preserve existing import-card / duplicate-prompt / storage-meter / theme-control / empty-state behavior.
  The count line should read `totalDocCount` (collection size), not the filtered length. A **filtered-empty**
  state (a view with no matches) gets its own gentle copy, distinct from the no-library-at-all `EmptyState`.

### 4. Copy / voice
Warm, literary, quiet (ui-context Voice), matching 15b's strings where they apply: an empty saved view →
"Nothing here yet — books you tag will gather here." Never shouty. Tag/view names are the user's words.

## Tests (`apps/mobile/src/tests`, vitest **node env — no jsdom / no RN renderer**)
Mobile tests are store + pure-logic/props-contract tests (see `native-store-duplicate-decision.test.ts` and
`duplicate-prompt.test.ts`); there is no RN render harness, so do NOT write RTL-native render tests. Cover:
- **store** (`native-store-tags.test.ts`, mirror `native-store-duplicate-decision.test.ts` — injected
  `MemoryRepository` + `MemoryBlobStore` + `createNativeClock`): each new method writes the right record +
  exactly one outbox entry with `entry.hlc === record.updatedAt` (invariant #2); `deleteTag` / `untagDoc` /
  `deleteSmartView` write a payload-less `delete` tombstone and remove the record; `tagDoc` uses the
  deterministic `docTagId` (re-tag same pair → same id, upserts to one record, advancing HLC); reads return
  stored records.
- **hook / pure logic**: factor the derivations (tagsByDoc orphan-drop; `LibraryEntry[]` on the canonical
  set; active-query → `evaluateSmartView` mapping) so they're unit-testable without a renderer. Assert orphan
  links produce no chip; alias docs are excluded; filtering delegates to `evaluateSmartView` (assert order
  matches the evaluator — don't re-implement it); switching the active view re-filters.
- **props/contract**: any pure helper a component leans on (e.g. ad-hoc-filter detection feeding "Save view",
  the `TAG_BG` map covering every `TagColor`, name-validation guard) gets a small contract test like
  `duplicate-prompt.test.ts`.

## Dependencies
None new at runtime. RN `Modal` is built-in; `react-native-svg`, `sonner-native`, `uniwind`, gesture-handler
+ reanimated are already present. No `packages/tokens`, `packages/core`, `packages/store`, or `convex/` change.

## Verify when done
- [ ] `pnpm -w typecheck` passes (no explicit-`undefined` for optional `LibraryEntry` fields — omit them).
- [ ] `pnpm -w test` passes (new mobile suites green; all prior suites unchanged; core/web/store untouched).
- [ ] `pnpm -w lint` clean.
- [ ] **Invariant #5** — filtering/view-membership is ONLY `evaluateSmartView`; the mobile layer adds no
      bespoke filter/order logic (it builds `LibraryEntry[]` and reads the result).
- [ ] **Invariant #2** — every tag/doc-tag/smart-view write carries one outbox entry whose `hlc` equals the
      record's `updatedAt`; deletes enqueue a payload-less tombstone.
- [ ] **Invariant #6** — tag colors come from `--color-tag-*` tokens via the `bg-tag-*` safelist, no
      hardcoded palette in `apps/mobile`; re-themes with light/dark.
- [ ] **architecture.md:76** — tags/links/views union by per-item id; same-item edits LWW. No server change;
      records ride 12a push/pull.
- [ ] Interactive tag controls `stopPropagation` (no accidental reader-open) and each is an a11y control with
      its own role/label + adequate hit area.
- [ ] Tag/view resolution runs on the **canonical** doc set (aliases excluded), same as today's list.

## Device-bound acceptance (user, on simulator/device — like 14c / 02d)
Headless tests cover store + logic; visual/interaction is verified on device: `npx expo start` → tag a book
from the picker (chip appears), untag (chip gone), create/rename/recolor/delete a tag (reflects on every
doc; delete clears chips and any pill filtering by it matches nothing), switch smart-view pills (Untagged /
In Progress / Finished filter correctly), save an ad-hoc tag filter (appears as a saved pill), and confirm a
chip/×/add-tag tap never also opens the reader. Light↔dark re-themes the chips.

## Deferred (not 15c)
- Bulk tag operations, tag drag-reorder, per-view custom sort — out of scope (same as 15b).
- Umbrella #15 is COMPLETE once 15c merges (core + web + mobile all shipped).
