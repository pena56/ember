# Unit 10a: core annotation model + anchor resolver + store persistence

Issue: #86 (part of umbrella Unit 10) · Branch: feat/86-annotation-model-anchor-resolver · Boundary: packages/core + packages/store
Route: standard — shared pure-TS brain (core+store), no new dep, no UI; ambiguity resolved (mirrors 04a/07a/08a/09d).

First slice of Unit 10 (Highlights + notes), split COMPLEX→sub-units by boundary per the
03/04/05/06/07/08/09 pattern: **10a** shared brain (this) → **10b** web reader highlight + notes UI →
**10c** mobile reader highlight + notes UI (device-bound). 10a is fully headless-testable: no UI, no
clock, no DOM, no pdf.js. It is the syncable annotation type + the pure anchor→rect resolver both
readers paint with — anchored against the `PageTextGeometry` shape 05c built **for exactly this** ("unit
10 resolves a `(page, startChar, endChar)` anchor to highlight rectangles from these items").

## Product decisions (confirmed with user, 2026-06-13)
- **4-color highlight palette:** `yellow | green | blue | pink`. New semantic tokens
  `--color-highlight-{yellow,green,blue,pink}` land in **10b** (where they are first rendered), NOT here —
  10a only carries the color *name* on the model. (Defaulted: a `highlight` with no explicit color → `yellow`.)
- **Two annotation kinds:** `highlight` (colored fill over a text range, optional note) and `note` (a
  standalone anchored note — a pin/comment on a range, no color fill, note text required). One record type
  discriminated by `kind`.
- **Text-anchored only this umbrella.** The anchor is `(page, startChar, endChar)` over the page's
  reconstructed text. The **pixel-rect fallback** for scanned/no-text PDFs is **deferred to its own later
  unit** — note it on the model (`AnchorKind = 'text'` reserved point) but build only `'text'` now.

## Annotation model (the syncable contract)
An annotation is a syncable, **mutable** record (note/color edits + deletes), UUID-keyed, resolved
cross-device by **union-by-UUID + HLC last-write-wins on edit** (architecture §Annotations & tags;
invariant #5 — the unit-12 reconciler owns the actual merge). Unlike sessions (append-only, invariant #3),
annotations have update + delete paths — that is the whole point of this type.

- **Text anchor** = `{ page, startChar, endChar, quote }`:
  - `page` 1-based; `startChar`/`endChar` are char offsets (half-open `[startChar, endChar)`) into the
    page's **concatenated text** as produced by `buildPageText` below — clients MUST derive offsets against
    that exact concatenation (no inserted separators) so resolution agrees by construction.
  - `quote` = the selected substring snapshot (`pageText.slice(startChar, endChar)`), kept for display
    (annotation list, sync conflict UI) and as a future re-anchoring signal. Not used by the resolver.
- **Time:** caller supplies `createdAt` (epoch ms — for stable display ordering) and `hlc`; `updatedAt`
  = encoded HLC (LWW tiebreak), restamped on every edit. Core stays clock-free (mirrors `makeDocument`
  taking `importedAt`, `makeReadingSession` taking flushed times).

## Implementation

### `packages/core/src/annotation.ts` (new)
- `export type AnchorKind = 'text';` — only `'text'` in this unit; `'pixelRect'` reserved for the deferred
  fallback unit (documented, not implemented).
- `export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';`
  `export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];`
  `export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'yellow';`
- `export type AnnotationKind = 'highlight' | 'note';`
- `export type TextAnchor = { kind: 'text'; page: number; startChar: number; endChar: number; quote: string };`
- `export type Annotation = { id: string; docId: string; kind: AnnotationKind; anchor: TextAnchor;`
  `  color?: HighlightColor; note?: string; createdAt: number; updatedAt: string };`
  (`color` present for `highlight`, absent for `note`; `note` optional for `highlight`, required-non-empty
  for `note` — enforced by the factory, not the type, to keep the record flat for the store/reconciler.)
- `export function makeAnnotation(args: { id: string; docId: string; kind: AnnotationKind; anchor:`
  `  TextAnchor; color?: HighlightColor; note?: string; createdAt: number }, ctx: { hlc: Hlc }): Annotation`
  — pure, **validates**, no mutation, no `Date.now()`/uuid (caller supplies `id`/time/hlc):
  - `anchor.kind` must be `'text'`; `page >= 1`; integer `startChar >= 0`; `endChar > startChar`
    (RangeError otherwise — an empty/inverted range is not an annotation).
  - `kind === 'highlight'` → `color = args.color ?? DEFAULT_HIGHLIGHT_COLOR`; `note` passes through if a
    non-empty trimmed string, else omitted.
  - `kind === 'note'` → `color` MUST be absent (omitted); `note` MUST be a non-empty trimmed string
    (RangeError otherwise — a standalone note with no text is meaningless).
  - sets `createdAt = args.createdAt`, `updatedAt = encode(ctx.hlc)`; `quote` passes through verbatim.
- `export function editAnnotation(annotation: Annotation, patch: { color?: HighlightColor; note?: string`
  ` | null }, ctx: { hlc: Hlc }): Annotation` — pure updater (no mutation) for note/color edits; returns a
  new record with `updatedAt = encode(ctx.hlc)`. `patch.note === null` clears the note (highlight only);
  `note: ''`/whitespace on a `note`-kind is a RangeError (can't empty a standalone note — delete it instead);
  changing `color` on a `note`-kind is a RangeError. Anchor/kind/createdAt are immutable (not in the patch).
- Re-export from `packages/core/src/index.ts` (`export * from './annotation.js'`). No runtime dep.

### `packages/core/src/anchor-resolver.ts` (new) — pure char-range → normalized rects
Imports only the 05c `PageTextGeometry`/`TextItemGeometry`/`NormalizedBox` types from `./text-geometry.js`.
- `export function buildPageText(geometry: PageTextGeometry): string` — concatenate `items[i].str` in
  `index` order with **no separator**. This is the canonical page-text string clients derive `startChar`/
  `endChar`/`quote` against (parity-by-construction with the resolver).
- `export function resolveAnchorRects(anchor: TextAnchor, geometry: PageTextGeometry): NormalizedBox[]`
  — map a `[startChar, endChar)` range to one normalized box **per overlapped text item** (each item is a
  run/line fragment ⇒ a multi-line selection yields several boxes, one per run):
  - Walk items in order tracking each item's `[itemStart, itemStart + str.length)` span in the concatenated
    text. For an item overlapping `[startChar, endChar)`:
    - Clip the overlap to the item: `from = max(startChar, itemStart)`, `to = min(endChar, itemStart + len)`.
    - If the item is **fully** covered, emit its `box` unchanged. If **partially** covered, emit a
      horizontal sub-slice of the box assuming **uniform per-char advance** within the run:
      `frac0 = (from - itemStart) / len`, `frac1 = (to - itemStart) / len`;
      `x = box.x + frac0 * box.width`, `width = (frac1 - frac0) * box.width`; `y`/`height` unchanged.
      (Uniform-advance is an approximation — proportional-spacing fonts vary per glyph; acceptable for a
      highlight tint, documented as a known limitation. Per-glyph boxes were explicitly deferred in 05c.)
  - **Skip zero-length items** (`str === ''` spacing items — they occupy 0 chars, contribute no rect) and
    skip items whose clipped span is empty or whose `box.width === 0`.
  - **Guards:** clamp the range to `[0, totalLen]`; `startChar >= endChar` after clamp, or empty geometry,
    → `[]`. Never emit `NaN`/negative-width boxes. Pure, deterministic, allocation-light, no input mutation.

### `packages/store/src/annotations.ts` (new)
Mirrors `sessions.ts`/`goal-config.ts`; consumer surface only (Metro-safe barrel carry-forward 03c/04a).
- `export const ANNOTATIONS_COLLECTION = 'annotations';`
- `export async function saveAnnotation(deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string },`
  `  annotation: Annotation): Promise<Annotation>` — **upsert** (serves both create and edit; the caller
  builds/edits via `makeAnnotation`/`editAnnotation` upstream): `repo.put(ANNOTATIONS_COLLECTION,
  annotation)` + exactly one HLC-stamped outbox entry (`op: 'put'`, `recordId: annotation.id`,
  `payload: annotation`) via `makeOutboxEntry` (invariant #2). Returns the annotation.
- `export async function deleteAnnotation(deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string },`
  `  id: string): Promise<void>` — `repo.delete(ANNOTATIONS_COLLECTION, id)` + exactly one outbox entry
  (`op: 'delete'`, `recordId: id`; `makeOutboxEntry` drops the payload for deletes). Idempotent at the
  repo layer (delete of an absent id is a no-op put-through; still enqueues the tombstone for sync).
- `export async function listAnnotations(repo: Repository, docId?: string): Promise<Annotation[]>` —
  `repo.query<Annotation>(ANNOTATIONS_COLLECTION[, rec => rec.docId === docId])`. Ordering is a UI concern
  (10b/10c sort by `createdAt`); the store returns the raw set.
- Barrel-export from `packages/store/src/index.ts` (`export * from './annotations.js'`).

## Tests

### `packages/core/src/tests/annotation.test.ts` (vitest; fixed `Hlc`, fixture anchors — no platform APIs)
- `makeAnnotation` highlight: defaults `color` to `yellow` when omitted; keeps an explicit color; trims and
  drops an empty/whitespace `note`, keeps a real note; `updatedAt === encode(hlc)`; `createdAt` passes through.
- `makeAnnotation` note-kind: requires a non-empty note (RangeError on empty/whitespace); rejects a `color`
  (RangeError); omits `color` on the record.
- `makeAnnotation` anchor validation: `page < 1`, `startChar < 0`, non-integer offsets, `endChar <= startChar`
  → RangeError; valid range builds; `quote` preserved verbatim.
- `editAnnotation`: changes color on a highlight + restamps `updatedAt` (later HLC); sets/changes a note;
  `note: null` clears a highlight's note; rejects emptying/whitespacing a note-kind's note (RangeError) and
  rejects color on a note-kind (RangeError); does **not** mutate the input (snapshot compare); anchor/kind/
  `createdAt` unchanged.

### `packages/core/src/tests/anchor-resolver.test.ts`
- `buildPageText` concatenates items in `index` order with no separator (incl. an empty spacing item = no
  added chars).
- Single-item full cover → emits that item's box unchanged.
- Partial cover of one item → correct horizontal sub-slice (`x`/`width` via uniform advance; `y`/`height`
  unchanged) — verify exact fractions on a hand-built fixture.
- Multi-item span (selection crossing 2–3 runs/lines) → one box per overlapped item; first/last partial,
  middle full.
- Range clamps to text length; `startChar >= endChar`, out-of-range, and empty geometry → `[]`.
- Zero-width / empty-string items contribute no rect and don't shift char accounting.
- Purity: resolver doesn't mutate `geometry`.

### `packages/store/src/tests/annotations.test.ts` (`MemoryRepository`, fixed `Hlc`, monotonic fake `newOutboxId`)
- `saveAnnotation` (create) writes exactly **one** record + **one** outbox entry (`op 'put'`, `recordId ===
  annotation.id`, `payload` deep-equals the record); `listAnnotations` returns it.
- `saveAnnotation` again with the same `id` (edit) → still **one** record (upserted, replaced) + a **second**
  outbox entry (mutation-log append).
- `deleteAnnotation` removes the record (`listAnnotations` no longer contains it) + enqueues **one** entry
  (`op 'delete'`, no payload).
- `listAnnotations(repo, docId)` filters by doc; no-filter returns all; multi-doc isolation holds.

## Dependencies
- none. Core stays runtime-dep-free; store reuses `@ember/core` + the existing `Repository` (`put`/`delete`/
  `query`) + `makeOutboxEntry`/`Hlc`/`encode`. No new dep.

## Verify when done
- [ ] `makeAnnotation`/`editAnnotation` enforce the two-kind rules (highlight color-defaulted + optional
      note; note-kind = required note, no color), validate the text anchor, stamp `updatedAt` from the HLC,
      and are pure (no input mutation, no clock/uuid in core).
- [ ] `resolveAnchorRects` maps a char range to one normalized box per overlapped item (full = box as-is,
      partial = uniform-advance sub-slice), skips empty/zero-width items, and returns `[]` on empty/inverted/
      out-of-range; `buildPageText` is the canonical separator-free concatenation clients anchor against.
- [ ] `saveAnnotation` upserts + enqueues exactly one `put`; `deleteAnnotation` deletes + enqueues exactly
      one `delete`; `listAnnotations` filters by docId. Barrel exports the consumer surface only.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (existing core/store suites + the new annotation/anchor/annotations tests)
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline; Convex never on the read path),
      #2 (every syncable mutation through the outbox with an HLC stamp — annotation put/delete),
      #5 (cross-device merge is the shared core engine's job — 10a only stamps LWW `updatedAt`, invents no
      merge logic); core/store import no platform API (no pdf.js/DOM in core; resolver consumes only the
      05c `PageTextGeometry` projection).
