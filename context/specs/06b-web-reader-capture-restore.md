# Unit 06b: Web reader capture/restore — resume reading position

Issue: #54 (part of umbrella Unit 06) · Branch: feat/54-web-reader-capture-restore · Boundary: apps/web
Route: standard — wires 06a's store layer into the existing web reader; single boundary, no new dep,
behavioral (no net-new visual surface), contract fully resolved below.

Second slice of Unit 06 (split COMPLEX→sub-units, like 04a–d / 05a–c): **06a** core+store reading-position
brain (#52, MERGED) → **06b** web reader capture/restore (this) → **06c** web Today tab + Continue
Reading card + tab-nav shell (deferred — carries Today-content + router open questions) → **06d** mobile
reader resume + native Today (device-bound, deferred).

## Goal
The web reader **resumes where you left off**: opening a document scrolls to the last saved page + within-
page offset; while reading, the position is captured (last-write, debounced) to the 06a store — one
`ReadingPosition` record + one HLC-stamped outbox entry per save. No Today card, no tab nav, no merge wiring
(furthest-page `mergeReadingPosition` stays unused until the unit-12 reconciler).

## Implementation

### `apps/web/src/store/web-store.ts` (extend)
Add to the `WebStore` interface + factory, mirroring the existing `getPdfBytes` pattern (caller supplies
nothing; the factory injects `clock`/`repo`):
- `saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition>`
  → calls `@ember/store`'s `saveReadingPosition({ repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() }, input)`.
  `ReadingPosition` type from `@ember/core`. (Last-write upsert + one outbox entry — all enforced in 06a; do
  not re-implement.)
- `getReadingPosition(docId: string): Promise<ReadingPosition | undefined>`
  → `@ember/store`'s `getReadingPosition(repo, docId)`.
- Do **not** expose `listReadingPositions` here — 06c's Today card needs it, not 06b (YAGNI; add it then).

### `apps/web/src/reader/reading-position.ts` (new — pure, no DOM/React)
Pure geometry helpers so the scroll math is unit-tested headlessly (jsdom has no layout):
- `export function computePageOffset(args: { pageTop: number; pageHeight: number; viewportTop: number }): number`
  — within-page offset `0..1`: `clamp((viewportTop - pageTop) / pageHeight, 0, 1)`. Guard `pageHeight <= 0 → 0`.
  `pageTop`/`viewportTop` are in the same coordinate space (e.g. both viewport-relative or both document-relative).
- `export function resumeScrollTop(args: { pageOffsetTop: number; pageHeight: number; offset: number }): number`
  — absolute scrollTop that lands the saved spot at the top of the viewport:
  `pageOffsetTop + clamp(offset, 0, 1) * pageHeight`. (`pageOffsetTop` = the page wrapper's offset within the
  scroll container.)
- A `clamp(n, lo, hi)` local helper (or reuse if one already exists in the web app — check before adding).

### `apps/web/src/reader/use-reading-position.ts` (new hook)
Encapsulates load-on-open + debounced last-write save; store comes from `useWebStore()`.
`useReadingPosition(args: { docId: string; ready: boolean; getCurrent: () => { page: number; offset: number }; onResume: (saved: ReadingPosition) => void }): { scheduleSave: () => void }`
- **Resume (once per docId):** when `ready` flips true, `await store.getReadingPosition(docId)`; if found, call
  `onResume(saved)`. Guard with a cancel flag + a ref so it fires exactly once per `docId` (re-opening a
  different doc re-arms). Never resume before `ready` (pages aren't measurable yet).
- **Save:** `scheduleSave()` debounces (≈600 ms) then reads `getCurrent()` and calls
  `store.saveReadingPosition({ docId, page, offset })`. Debounce so scroll/page-turn bursts don't flood the
  outbox (06a's documented throttling-is-UI contract). Flush/cancel the pending timer on unmount and on
  `docId` change (don't write one doc's position under another's id). Swallow/log save errors — a failed
  position save must never break reading (invariant #1: fully functional offline).

### `apps/web/src/reader/reader-page.tsx` (wire)
- Give the scroll container a ref (the existing `containerRef`, or the scroll root) and a way to read the
  active page wrapper element (the `ScrollReader` already keeps `pageRefs`; lift a `getPageElement(page)` or
  reuse the `data-page` lookup).
- `getCurrent()`:
  - scroll mode → `{ page: currentPage, offset: computePageOffset(...) }` using the current page wrapper's
    rect vs. the scroll root's top.
  - paged mode → `{ page: currentPage, offset: 0 }` (whole page in view; resume to page top).
- `onResume(saved)`:
  - set `currentPage` to `saved.page` (works for both modes — paged shows that page; scroll uses it as the
    active page).
  - scroll mode → after the target page wrapper is mounted/measured, scroll the root to
    `resumeScrollTop({ pageOffsetTop: wrapper.offsetTop, pageHeight: wrapper.offsetHeight, offset: saved.offset })`.
    paged mode → page set is sufficient (offset ignored).
- Call `scheduleSave()` on `onPageChange` (both readers already route page changes through it) and on scroll
  settle in scroll mode (a scroll listener on the root → `scheduleSave()`; the hook debounces). Paged mode:
  page changes alone drive saves.
- Keep all existing reader behavior (modes, themes, virtualization, text layer) untouched.

### Tests
- `apps/web/src/reader/reading-position.test.ts` (pure): `computePageOffset` — top of page → 0, fully past →
  1, mid-page fraction, clamps over/under, `pageHeight<=0 → 0`. `resumeScrollTop` — `offset 0 → pageOffsetTop`,
  `offset 1 → pageOffsetTop+pageHeight`, mid fraction, clamps.
- `apps/web/src/tests/reader-restore.test.tsx` (jsdom + spy/`MemoryRepository` store, pdf.js mocked like
  `app-navigation.test.tsx`): (1) opening a doc that has a saved position calls `getReadingPosition(docId)` and
  sets the reader to the saved page (assert page indicator / `currentPage`); (2) a page turn results in a
  debounced `saveReadingPosition({ docId, page, ... })` call (fake timers); (3) opening a doc with **no** saved
  position stays on page 1 and does not throw. (Pixel-accurate offset is browser-verified — jsdom reports 0
  layout.)
- Store-surface coverage: extend an existing web-store test (or add one) asserting `saveReadingPosition` writes
  one record + one outbox entry and `getReadingPosition` reads it back (thin wrapper over already-tested 06a).

## Dependencies
- none. `@ember/core` / `@ember/store` already provide the reading-position layer (06a); pdfjs already a web dep.

## Verify when done
- [ ] Opening a document resumes to the saved page + within-page offset (scroll mode); paged mode resumes the page.
- [ ] Reading captures position as last-write (debounced) — one `ReadingPosition` record + one HLC-stamped
      outbox entry per save; re-saving a lower page replaces the stored record (06a contract, exercised here).
- [ ] A doc with no saved position opens at page 1; a failed save never breaks reading.
- [ ] `mergeReadingPosition` remains unused (no merge on the local save/read path — reconcile is unit 12).
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean
- [ ] No invariant violated — esp. #1 (works offline, Convex never on read path), #2 (every save through the
      outbox with an HLC stamp), #5 (no client-side merge logic — merge lives only in core, called by the
      reconciler later). packages/core + packages/store stay byte-identical (apps/web-only change).

## Routing note
Behavioral wiring on the existing reader — **no net-new visual surface and no new component**, so
**frontend-design does not apply** (nothing to design). Standard route: TDD executor (Sonnet) → fresh-context
Opus review. Run `impeccable` only if a visible resume affordance (e.g. a "Resumed to page N" cue) is added —
it then must be token-driven per ui-context.md. Browser-verify (user, before merge): open a multi-page PDF,
scroll to mid-document, back to Library, reopen → resumes to the same page+offset; switch to paged, turn pages,
reopen → resumes the page; reopen a never-read doc → page 1.
