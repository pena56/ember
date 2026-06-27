# Unit 14c: Mobile duplicate-merge UI + canonical read-routing

Issue: #123 (umbrella #14) · Branch: feat/123-mobile-duplicate-merge-ui · Boundary: `apps/mobile`
Route: **standard** — one boundary (`apps/mobile` + its tests), no new dep, no open ambiguity. UI
unit → frontend-design + impeccable run at build, before review.

Third and final slice of umbrella **#14**:
**14a** core conflict engine (#119, MERGED) → **14b** web duplicate-merge UI (#121/PR #122, MERGED) →
**14c** mobile duplicate-merge UI (this, device-bound). The **claim-review screen** is sliced out to a
later mobile unit (user decision 2026-06-27); the policy **settings** screen is unit 17.

This is the **device-bound RN mirror of 14b** — same `@ember/core` engine, same decision-record-through-
outbox contract, same canonical read-routing. Port 14b's behaviour to React Native + uniwind; invent no
new product behaviour.

## Goal
Drive 14a's pure engine for the **near-duplicate** case inside the mobile app: when the library holds a
re-scan / re-export of a book it already has (different SHA, equal normalized title, in-band byte size),
surface a gentle inline prompt; **Merge** writes a syncable `duplicate-decisions` record (canonical
chosen) through the outbox and the alias disappears; **Keep both** records a `separate` decision so the
pair is never re-surfaced. Library + Today route through `resolveCanonicalId` so a merged alias collapses
to its canonical. Non-destructive and reversible — no bytes/records are deleted.

## Design   ← UI unit
Honour `ui-context.md` tokens (Amber Ember) and warm/calm voice — *never* alarming. Token-only RN classes
via uniwind (invariant #6); re-themes light/dark through the existing `useTheme` wiring. Match the idiom
already in `library-screen.tsx` / `import-card.tsx` (`bg-surface-raised`, `border-line`, `font-serif`
headings, `font-sans` body, `text-text` / `text-text-muted`, accent on `bg-accent` + `text-on-accent`).

- **Duplicate prompt** = a soft inline `bg-surface-raised` card with a `border-line` hairline, rendered in
  the Library `FlatList` `ListHeaderComponent` (below the `ImportCard`), shown only when an **undecided**
  cross-pair exists. One pair at a time (queue the rest). Warm framing, not a warning:
  - Title line (`font-serif`): *"This looks like a book you already have"*.
  - Body (`font-sans`, `text-text-muted`): the two copies side by side — each shows title · filename ·
    size · added date so the user can tell the re-scan from the original.
  - Primary action **Merge** (accent `Pressable`, `bg-accent` + `text-on-accent` ink — never white-on-
    amber, the 04d a11y rule): keeps one copy as the canonical and hides the other. Default canonical =
    the **larger byteSize** (more complete scan); let the user flip which copy is kept via a radio
    selector (one selectable card per copy). Merge copy: gentle, e.g. *"Keep the larger copy, hide the
    other."*
  - Secondary **Keep both** (ghost/outline `Pressable`): records `separate`; the pair never re-surfaces.
  - Tertiary **Not now** (quiet text `Pressable`): dismiss for this session only (no record written) —
    the pair re-surfaces next mount. Distinct from "Keep both".
  - A11y (carry 13d's RN-native pattern): the keep-which selector is a radio group
    (`accessibilityRole="radiogroup"` wrapping `accessibilityRole="radio"` +
    `accessibilityState={{ checked }}` per copy — mirror `ThemeControl` in `library-screen.tsx`); the
    card is labelled (`accessibilityLabel`); every `Pressable` has a ≥44pt hit target (`min-h-[44px]` or
    `hitSlop`); action labels are descriptive. No native Alert dialog — merge is reversible.
- No scary modal — merge is reversible (a later `separate` decision with a higher HLC un-merges), so an
  inline card with plain buttons is right; do **not** gate it behind `Alert.alert` / a confirm sheet.

## Implementation
All in `apps/mobile/src`. Import the engine + constants from `@ember/core` (14a): `detectDuplicates`,
`makeDuplicateDecision`, `resolveCanonicalId`, `duplicatePairId`, `makeOutboxEntry`,
`DUPLICATE_DECISIONS_COLLECTION`, types `DuplicatePair` / `DuplicateDecision`. **No `packages/*` or
`convex/` change** — the new collection rides 12a's generic push/pull and the decision writer is inline in
native-store (mirrors `createAnnotation`'s shared-HLC `repo.put` + `repo.enqueue(makeOutboxEntry(...))`
shape). Reuse 14b's logic verbatim where the layer is platform-agnostic (the selector + hook are nearly
identical; only the React import surface + store hook differ).

### `store/native-store.ts` — decision read/write (inline, through the outbox)
Add to the `NativeStore` interface + factory (deps already hold `repo` + `clock`):
- `listDuplicateDecisions(): Promise<DuplicateDecision[]>` → `repo.query(DUPLICATE_DECISIONS_COLLECTION)`
  (read-only; mirror `listBlobStatuses`).
- `saveDuplicateDecision(input: { aId: string; bId: string; canonicalId: string; decision: 'merged' | 'separate' }): Promise<DuplicateDecision>`
  — `const hlc = clock.nextStamp();` build via `makeDuplicateDecision({ ...input, hlc })`, then **exactly
  one** `repo.put(DUPLICATE_DECISIONS_COLLECTION, rec)` + one `repo.enqueue(makeOutboxEntry({ id:
  clock.newOutboxId(), hlc, collection: DUPLICATE_DECISIONS_COLLECTION, recordId: rec.id, op: 'put',
  payload: rec }))` (invariant #2 — `entry.hlc === payload.updatedAt`, the SAME raw stamp passed to both;
  do not pre-encode). `rec.id` is the order-independent pair key, so concurrent cross-device decisions
  LWW-converge. This matches 14b's web-store method exactly.

### `library/use-duplicates.ts` — undecided-pair surface (new hook, mirror of 14b)
- Reads via `useNativeStore()` (guard `ready`/`store` like `use-library.ts`); loads documents +
  decisions (`store.listDocuments()` already recently-added-first; `store.listDuplicateDecisions()`).
- Detect over **canonical docs only** (14b's hardening): `docs.filter((d) => resolveCanonicalId(decisions,
  d.id) === d.id)` → `detectDuplicates(canonicals)` → candidate pairs; keep only those with **no** existing
  decision record (`duplicatePairId(a,b)` not in the decision set — neither `merged` nor `separate`) and
  not session-dismissed.
- Returns `{ pending, current, currentDocs: { a, b } | undefined, defaultCanonicalId, loading, merge(pair, canonicalId), keepSeparate(pair), dismiss(pair) }`.
  `merge`/`keepSeparate` call `store.saveDuplicateDecision(...)` then refresh (loadTick); `dismiss` adds the
  pair id to an in-memory `useRef` Set only (no record). Default canonical = the doc with the larger
  `byteSize` (UI may override). Carry the cancel-flag + loadTick refresh pattern from `use-library.ts`.

### `library/use-library.ts` — hide aliases
- Add `store.listDuplicateDecisions()` to the existing `Promise.all`. Drop any document whose
  `resolveCanonicalId(decisions, doc.id) !== doc.id` (it folded into a canonical kept elsewhere). The blob-
  status join + `deriveSyncState` + `blobChange` subscribe stay unchanged. The count line in
  `LibraryScreen` already derives from `documents.length`, so it updates for free.

### `library/duplicate-prompt.tsx` — the inline card (new, frontend-design + impeccable)
- Props: `{ pair, docs: { a: Document; b: Document }, defaultCanonicalId, onMerge(canonicalId), onKeepSeparate(), onDismiss() }`.
- Pure presentational RN component (no store access) so it unit-tests on props. Renders the design above
  with uniwind classes; local `useState` for the selected canonical (seeded from `defaultCanonicalId`).

### `library/library-screen.tsx` — mount the prompt
- Call `useDuplicates()`; when `current` is defined, render `<DuplicatePrompt>` inside the `FlatList`
  `ListHeaderComponent`, below the `ImportCard` (above `StorageMeter`), wiring the three actions. The
  library list stays driven by `useLibrary` (alias-filtered).

### `today/use-continue-reading.ts` (+ `today/select-continue-reading.ts`) — collapse aliases
- Thread the decision set in and route each position's docId through `resolveCanonicalId`; drop items
  whose doc is an alias (its canonical already yields a Continue item), so a merged re-scan never shows a
  second resume card. Keep the selector pure (add a `decisions: ReadonlyArray<DuplicateDecision>` arg,
  default `[]` ⇒ existing callers/tests stay green). Add `store.listDuplicateDecisions()` to the hook's
  `Promise.all`; the swallow-on-error contract is unchanged (Today must still render if a read fails —
  invariant #1).

> Reader open-path needs no routing: aliases are hidden from the library, so the user cannot open one —
> the canonical doc resumes its own position as today. `resolveCanonicalId` routing here is the
> observable, list-level behaviour (Library + Today).

## Dependencies
None. uniwind primitives + `@ember/core` engine already present; no runtime or dev dep added.

## Verify when done
- [ ] Importing a re-scan of an existing book (different bytes, same title, in-band size) surfaces the
      inline prompt; **Merge** hides the chosen alias and leaves one canonical row; **Keep both** keeps
      both rows and never re-surfaces the pair.
- [ ] A `duplicate-decisions` record is written with **exactly one** HLC-stamped outbox entry per
      decision (`entry.hlc === payload.updatedAt`); `listDuplicateDecisions` reads it back.
- [ ] Today's Continue Reading shows no duplicate card for a merged alias.
- [ ] `pnpm -w typecheck` passes.
- [ ] `pnpm -w test` passes (new mobile suites green; existing mobile/web/core/store/convex tests
      unchanged — `select-continue-reading`'s new `decisions` arg defaults to `[]`).
- [ ] `pnpm -w lint` clean.
- [ ] **Invariant #5** — all merge/canonical logic comes from `@ember/core` (14a); the mobile app invents
      none (it only writes the decision record + reads through `resolveCanonicalId`).
- [ ] **Invariant #2** — the decision record carries an encoded-HLC `updatedAt` and rides the outbox;
      nothing else is enqueued.
- [ ] **Invariant #6** — token-only uniwind UI (no hardcoded palette; `text-on-accent` ink on the accent
      CTA), re-themes light/dark.
- [ ] No `packages/*` change, no `convex/` change, no new dependency.

## Deferred (not 14c)
- **Claim-review screen** (review-before-commit account claim rendering `planClaimMerge`) → its own later
  mobile unit, mirroring the deferred web claim-review unit.
- **Policy settings screen** (global default + per-file `furthest`/`latest` override) → unit 17.
- Folding the two copies' positions/annotations into one (true record migration) — 14c is non-destructive
  aliasing only; the canonical keeps its own progress.
