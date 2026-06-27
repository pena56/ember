# Unit 14b: Web duplicate-merge UI + canonical read-routing

Issue: #121 (umbrella #14) · Branch: feat/121-web-duplicate-merge-ui · Boundary: `apps/web`
Route: **standard** — one boundary (`apps/web` + its tests), no new dep, all forks resolved. UI
unit → frontend-design + impeccable run at build, before review.

Second slice of umbrella **#14**:
**14a** core conflict engine (#119, MERGED) → **14b** web duplicate-merge UI (this) → **14c** mobile
conflict UI (device-bound). The **claim-review screen** is sliced out to a later web unit
(user decision 2026-06-27); the policy **settings** screen is unit 17.

## Goal
Drive 14a's pure engine for the **near-duplicate** case inside the web app: when the Library holds a
re-scan / re-export of a book it already has (different SHA, equal normalized title, in-band size),
surface a gentle inline prompt; **Merge** writes a syncable `duplicate-decisions` record (canonical
chosen) through the outbox and the alias disappears; **Keep both** records a `separate` decision so the
pair is never re-surfaced. Library + Today route through `resolveCanonicalId` so a merged alias
collapses to its canonical. Non-destructive and reversible — no bytes/records are deleted.

## Design   ← UI unit
Honour `ui-context.md` tokens (Amber Ember) and warm/calm voice — *never* alarming. Build on shadcn
primitives (Card/Button), token-driven (invariant #6), `data-app-theme` dark wiring inherited.

- **Duplicate prompt** = a soft inline `surface.raised` card with a `line` hairline, sitting above the
  document list (below the dropzone), shown only when an **undecided** cross-pair exists. One pair at a
  time (queue the rest). Warm framing, not a warning:
  - Title line (Fraunces): *"This looks like a book you already have"*.
  - Body (Inter, `text.muted`): the two copies side by side — each shows title · filename · size · added
    date so the user can tell the re-scan from the original.
  - Primary action **Merge** (accent CTA, `on-accent` ink — never white-on-amber, the 04d a11y rule):
    keeps one copy as the canonical and hides the other. Default canonical = the **larger byteSize**
    (more complete scan); let the user flip which copy is kept (e.g. a "keep this one" affordance per
    copy, selected state on the accent). Merge copy: gentle, e.g. *"Keep the larger copy, hide the other."*
  - Secondary **Keep both** (ghost/outline button): records `separate`; the pair never re-surfaces.
  - Tertiary **Not now** (quiet text button): dismiss for this session only (no record written) — the
    pair re-surfaces next mount. Distinct from "Keep both".
  - A11y: the card is a labelled `section` / `role="group"` with an accessible name; the keep-which
    selector is a radio group (`aria-checked`); all controls ≥44px hit target; visible focus ring
    (`focus-visible:outline-accent`), motion-safe.
- No scary modal — merge is reversible (a later `separate` decision with a higher HLC un-merges), so an
  inline card with plain buttons is right; do **not** gate it behind an AlertDialog.

## Implementation
All in `apps/web/src`. Import the engine + constants from `@ember/core` (14a): `detectDuplicates`,
`makeDuplicateDecision`, `resolveCanonicalId`, `DUPLICATE_DECISIONS_COLLECTION`, types
`DuplicatePair` / `DuplicateDecision`. **No `packages/*` or `convex/` change** — the new collection
rides 12a's generic push/pull and the decision writer is inline in web-store (mirrors
`saveReadingPosition`'s repo.put + repo.enqueue shape).

### `store/web-store.ts` — decision read/write (inline, through the outbox)
Add to the `WebStore` interface + factory (deps already hold `repo` + `clock`):
- `listDuplicateDecisions(): Promise<DuplicateDecision[]>` → `repo.query(DUPLICATE_DECISIONS_COLLECTION)`
  (read-only).
- `saveDuplicateDecision(input: { aId: string; bId: string; canonicalId: string; decision: 'merged' | 'separate' }): Promise<DuplicateDecision>`
  — `const hlc = clock.nextStamp();` build via `makeDuplicateDecision({ ...input, hlc })`, then **exactly
  one** `repo.put(DUPLICATE_DECISIONS_COLLECTION, rec)` + one `repo.enqueue(makeOutboxEntry({ id:
  clock.newOutboxId(), hlc, collection: DUPLICATE_DECISIONS_COLLECTION, recordId: rec.id, op: 'put',
  payload: rec }))` (invariant #2 — `entry.hlc === payload.updatedAt`). Import `makeOutboxEntry` from
  `@ember/core`. `rec.id` is the order-independent pair key, so concurrent cross-device decisions
  LWW-converge.

### `library/use-duplicates.ts` — undecided-pair surface (new hook)
- Loads documents + decisions (`store.listDocuments()` already recently-added-first; `store.listDuplicateDecisions()`).
- `detectDuplicates(docs)` → candidate pairs; keep only those with **no** existing decision record
  (`duplicatePairId(a,b)` not in the decision set — neither `merged` nor `separate`) and not
  session-dismissed.
- Returns `{ pending: DuplicatePair[]; current: DuplicatePair | undefined; merge(pair, canonicalId); keepSeparate(pair); dismiss(pair) }`.
  `merge`/`keepSeparate` call `store.saveDuplicateDecision(...)` then refresh; `dismiss` adds the pair id
  to in-memory session state only (no record). Mirror `use-library`'s cancel-flag + loadTick refresh.
- Default canonical for a pair = the doc with the larger `byteSize` (UI may override via the keep-which
  selector). Provide the two `Document` projections for `current` so the card can render titles/sizes
  without a second fetch (return `currentDocs: { a: Document; b: Document }` alongside `current`).

### `library/use-library.ts` — hide aliases
- Add `store.listDuplicateDecisions()` to the existing `Promise.all`. Drop any document whose
  `resolveCanonicalId(decisions, doc.id) !== doc.id` (it folded into a canonical kept elsewhere in the
  list). Everything else (status join, sync badge) unchanged. The count line in `LibraryPage` already
  derives from `documents.length`, so it updates for free.

### `library/duplicate-prompt.tsx` — the inline card (new, frontend-design + impeccable)
- Props: `{ pair, docs: { a: Document; b: Document }, onMerge(canonicalId), onKeepSeparate(), onDismiss() }`.
- Renders the design above; pure presentational (no store access) so it unit-tests on props.

### `library/library-page.tsx` — mount the prompt
- Call `useDuplicates()`; when `current` is defined, render `<DuplicatePrompt>` between the dropzone and
  the document list, wiring the three actions. Library list stays driven by `useLibrary` (alias-filtered).

### `today/use-continue-reading.ts` (+ `select-continue-reading.ts`) — collapse aliases
- Thread the decision set in and route each position's docId through `resolveCanonicalId`; drop items
  whose doc is an alias (its canonical already yields a Continue card), so a merged re-scan never shows a
  second resume card. Keep the selector pure (pass `decisions` as an arg; default `[]` keeps existing
  callers/tests green). Swallow-on-error contract unchanged.

> Reader open-path needs no routing: aliases are hidden from the Library, so the user cannot open one —
> the canonical doc resumes its own position as today. `resolveCanonicalId` routing here is the
> observable, list-level behaviour (Library + Today).

## Dependencies
None. shadcn primitives + `@ember/core` engine already present; no runtime or dev dep added.

## Verify when done
- [ ] Importing a re-scan of an existing book (different bytes, same title, in-band size) surfaces the
      inline prompt; **Merge** hides the chosen alias and leaves one canonical row; **Keep both** keeps
      both rows and never re-surfaces the pair.
- [ ] A `duplicate-decisions` record is written with **exactly one** HLC-stamped outbox entry per
      decision (`entry.hlc === payload.updatedAt`); `listDuplicateDecisions` reads it back.
- [ ] Today's Continue Reading shows no duplicate card for a merged alias.
- [ ] `pnpm -w typecheck` passes.
- [ ] `pnpm -w test` passes (new web suites green; existing web/core/store/convex tests unchanged —
      `select-continue-reading`'s new `decisions` arg defaults to `[]`).
- [ ] `pnpm -w lint` clean.
- [ ] **Invariant #5** — all merge/canonical logic comes from `@ember/core` (14a); the web app invents
      none (it only writes the decision record + reads through `resolveCanonicalId`).
- [ ] **Invariant #2** — the decision record carries an encoded-HLC `updatedAt` and rides the outbox;
      nothing else is enqueued.
- [ ] **Invariant #6** — token-only UI (no hardcoded palette; `on-accent` ink on the accent CTA).
- [ ] No `packages/*` change, no `convex/` change, no new dependency.

## Deferred (not 14b)
- **Claim-review screen** (review-before-commit account claim rendering `planClaimMerge`, intercepting
  the auto-reconcile-on-mount flow) → its own later web unit.
- **Mobile duplicate-merge UI (14c):** the same, device-bound (RN), mirroring 14b.
- **Policy settings screen** (global default + per-file `furthest`/`latest` override) → unit 17.
- Folding the two copies' positions/annotations into one (true record migration) — 14b is
  non-destructive aliasing only; the canonical keeps its own progress.
