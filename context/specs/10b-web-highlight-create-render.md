# Unit 10b: web reader — highlight tokens + selection→anchor + render + create

Issue: #88 (part of umbrella Unit 10) · Branch: feat/88-web-highlight-create-render · Boundary: apps/web (+ packages/tokens leaf)
Route: standard — one client boundary (web reader), product forks resolved, the one technical unknown
(DOM selection → char offsets) is isolated in a pure jsdom-testable helper. Mirrors 09e (single rich web UI slice).

Second slice of umbrella Unit 10 (Highlights + notes). 10a built the shared brain (annotation model +
`resolveAnchorRects` + store persistence). **10b is the web read+create slice**: paint saved highlights on the
page and create a highlight from a text selection. Split COMPLEX→by-capability:
**10b** web create+render (this) → **10c** web edit/recolor/delete + standalone notes → **10d** mobile.
First verifiable result: *select text → tap a color → highlight paints → reload → still there.*

## Product decisions (confirmed with user, 2026-06-13)
- **Selection affordance = floating swatch toolbar.** On a non-collapsed text selection inside the reader, a
  small floating toolbar appears above the selection with the **4 color swatches**; tapping one creates the
  highlight in that color and clears the selection. (The **"Note" button** in that toolbar + standalone notes
  are **10c** — 10b ships swatches only.)
- **Edit/delete deferred to 10c.** 10b creates + renders only; clicking an existing highlight does nothing yet.
  (So a highlight made in 10b can't be removed in 10b — acceptable for an internal milestone; 10c adds it.)
- **Text-anchored only** (10a constraint). Scanned/no-text-layer pages have no selectable text, so the toolbar
  never appears and nothing can be highlighted there — the pixel-rect fallback is a later unit.
- **Single-page highlights.** An anchor is one page (10a). A selection dragged across a page boundary anchors to
  the page where it **started** and clips `endChar` to that page's text length (documented limitation).

## Token additions — `packages/tokens` (the leaf this slice introduces)
The 4 highlight hues are theme-independent (like the ember accent), authored once and consumed by both clients
(web now, mobile in 10d). Warm "Amber Ember" palette — starting values; `frontend-design`/`impeccable` may
refine the exact hexes, but they MUST stay single-sourced in tokens (invariant #6 — no hardcoded highlight
colors in components).

- `packages/tokens/src/index.ts` — add a registry the parity test drives:
  `export const highlights = { yellow: '#f4d06f', green: '#9fc08a', blue: '#93b7d4', pink: '#e3a7be' } as const;`
  (keys are the 10a `HighlightColor` union members; do not rename.)
- `packages/tokens/src/theme.css` — inside `@theme`, declare
  `--color-highlight-yellow / -green / -blue / -pink` with those hexes (so `bg-highlight-yellow` utilities
  generate). Theme-independent → no per-selector overrides needed.
- `packages/tokens/src/theme.uniwind.css` — same four `--color-highlight-*` inside its `@theme` block (for 10d).
- `packages/tokens/src/tests/index.test.ts` — extend: assert `highlights` exports the 4 keys with those values;
  add a CSS-parity loop asserting every `highlights` hex appears in `theme.css` AND `theme.uniwind.css`, and that
  `--color-highlight-yellow|green|blue|pink` property names are declared in both (mirror the existing parity loops).

## Implementation — `apps/web`

### `apps/web/src/reader/selection-anchor.ts` (new) — pure DOM→offset mapping (the isolated unknown)
pdf.js `TextLayer` renders one `<span>` per non-empty text item, in `items` order, with `span.textContent ===
item.str`. Because `buildPageText` (10a) concatenates ALL items' `str` with no separator and empty items add 0
chars, **the in-order concatenation of the text-layer's text nodes equals `buildPageText(geometry)`** — so a DOM
position maps to a `buildPageText` char offset by summing the lengths of all text nodes before it (document order)
plus the in-node offset. This file owns that mapping; it takes a root element + DOM Range and is fully jsdom-testable
(no pdf.js runtime — tests build the span DOM by hand).

- `export function charOffsetOf(root: HTMLElement, node: Node, offsetInNode: number): number | null` — walk text
  nodes under `root` in document order (TreeWalker, `SHOW_TEXT`); accumulate `length`; when the walker reaches
  `node`, return `accumulated + offsetInNode`. Return `null` if `node` is not a text node within `root`.
- `export function selectionToTextAnchor(args: { root: HTMLElement; page: number; range: Range; geometry:
  PageTextGeometry }): TextAnchor | null` —
  - Reject collapsed ranges (`range.collapsed`) → `null`.
  - `startChar = charOffsetOf(root, range.startContainer, range.startOffset)`;
    `endChar = charOffsetOf(root, range.endContainer, range.endOffset)`. If `startChar` is `null` → `null`.
  - If `endChar` is `null` (range ends outside this page's root — cross-page drag), clip
    `endChar = buildPageText(geometry).length`.
  - Order-normalize (`if (startChar > endChar) swap`); if `startChar === endChar` → `null`.
  - `quote = buildPageText(geometry).slice(startChar, endChar)` — derive the quote from the **canonical** page text
    (10a), NOT from the DOM selection string, so it always agrees with the resolver regardless of DOM whitespace quirks.
  - return `{ kind: 'text', page, startChar, endChar, quote }`.
- `export function cssRectFromBox(box: NormalizedBox, pageWidthPx: number, pageHeightPx: number): { left: number;
  top: number; width: number; height: number }` — `{ left: box.x*W, top: box.y*H, width: box.width*W, height:
  box.height*H }` (px). Pure; the inverse-scaling companion to `resolveAnchorRects`.

Imports `buildPageText`, types `PageTextGeometry`/`TextAnchor`/`NormalizedBox` from `@ember/core`. No React, no pdf.js.

### `apps/web/src/reader/highlight-layer.tsx` (new) — paints saved highlights
- Props: `{ annotations: Annotation[]; geometry: PageTextGeometry | undefined; pageWidth: number; pageHeight:
  number }` (annotations already filtered to this page; `pageWidth/Height` = the rendered page box CSS px).
- For each `annotation` (defensively keep only `kind === 'highlight'`), `resolveAnchorRects(annotation.anchor,
  geometry)` → boxes → `cssRectFromBox` → one absolutely-positioned `<div>` per box.
- Tint: background = the highlight color token at reduced alpha so the canvas text reads through, e.g.
  `bg-highlight-{color}` with an opacity modifier (or `--color-highlight-*` via an arbitrary value). Slight
  rounding, `pointer-events-none`, `aria-hidden`. The layer is `absolute inset-0`, rendered **between the canvas
  and the text layer** (so selection still works on top). Must stay legible on paper/sepia/night — if one alpha
  doesn't read on night, drive the alpha/blend from a variable (don't hardcode a second palette). Renders nothing
  when `geometry` is undefined.

### `apps/web/src/reader/selection-toolbar.tsx` (new) — floating create affordance
- Renders `null` unless there is an active, non-collapsed selection inside the reader content. Tracks selection via
  a `selectionchange`/`mouseup`+`keyup` listener (debounced/rAF); reads `window.getSelection()`.
- Resolve the page: from the selection's `anchorNode`, climb to the nearest `[data-page]` wrapper → `pageNumber`,
  and to that page's text-layer root (`.textLayer`). Look up that page's `geometry` from the map passed in.
- Position: `getBoundingClientRect()` of `range` → place the toolbar centered above the selection (fixed position,
  flip below if near the top edge). Keep it within the viewport.
- Content: 4 swatch buttons (the 4 `HighlightColor`s), each `aria-label={`Highlight ${color}`}`, a visible focus
  ring, `bg-highlight-{color}`. (No Note button in 10b.)
- On swatch click: `anchor = selectionToTextAnchor({ root, page, range, geometry })`; if non-null call
  `onCreate({ anchor, color })`; then `getSelection()?.removeAllRanges()` and hide. If the page has no geometry or
  the anchor is null (e.g. selection outside any text layer), do nothing.
- Props: `{ pageGeometries: Map<number, PageTextGeometry>; onCreate: (input: { anchor: TextAnchor; color:
  HighlightColor }) => void }`.

### `apps/web/src/reader/use-annotations.ts` (new) — load + create hook
- `export function useAnnotations(docId: string)` → loads `store.listAnnotations(docId)` on mount/`docId` change
  into state; exposes:
  - `annotationsByPage: Map<number, Annotation[]>` (grouped by `anchor.page`) for the renderer.
  - `createHighlight(input: { anchor: TextAnchor; color: HighlightColor }): Promise<void>` — calls
    `store.createAnnotation({ docId, kind: 'highlight', anchor: input.anchor, color: input.color })`, appends the
    returned record to state (optimistic-after-await; no full reload).
- Uses `useWebStore()`. (update/delete land in 10c.)

### `apps/web/src/store/web-store.ts` — facade additions (the only store change)
Mirror the existing `recordSession`/`saveReadingPosition` wiring (clock supplies id/time/hlc; store stays the
single place the clock is read). One mutation = one `nextStamp()` shared by the factory + the outbox entry.
- `createAnnotation(input: { docId: string; kind: AnnotationKind; anchor: TextAnchor; color?: HighlightColor;
  note?: string }): Promise<Annotation>` —
  `const hlc = clock.nextStamp();`
  `const annotation = makeAnnotation({ ...input, id: clock.newId(), createdAt: clock.now() }, { hlc });`
  `return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, annotation);`
- `listAnnotations(docId: string): Promise<Annotation[]>` → `listAnnotations(repo, docId)`.
- Add both to the `WebStore` interface + import `makeAnnotation`, `saveAnnotation`, `listAnnotations`, and the
  `Annotation`/`AnnotationKind`/`TextAnchor`/`HighlightColor` types from `@ember/core` / `@ember/store`.
  (10c adds `updateAnnotation`/`deleteAnnotation` — out of scope here.)

### Wiring — `apps/web/src/reader/reader-page.tsx` + `pdf-page.tsx`
- `reader-page.tsx`: call `useAnnotations(docId)`. Maintain a `pageGeometriesRef`/state `Map<number,
  PageTextGeometry>` filled from a `handleTextGeometry` passed into each `PdfPage` via the existing
  **`onTextGeometry`** prop (currently unused — this is the 05c-2 seam). Render `<SelectionToolbar
  pageGeometries={…} onCreate={createHighlight} />` once at reader level (inside the `data-reader-theme` wrapper).
  Thread per-page `annotationsByPage.get(pageNum) ?? []` and the page's geometry down through `ScrollReader`/
  `PagedReader` to `PdfPage`. Keep paged + scroll modes working.
- `pdf-page.tsx`: accept `annotations: Annotation[]` (this page). Inside the `relative` page wrapper, render
  `<HighlightLayer annotations geometry pageWidth pageHeight />` **between `<canvas>` and the `.textLayer` div**,
  where `pageWidth = displayWidth` and `pageHeight` = the canvas CSS height already computed. Continue to call
  `onTextGeometry` (already wired). No change to the canvas/text-layer render path.

## Design quality (UI unit — runs in the executor step, before review)
Net-new UI (`SelectionToolbar`, highlight tint treatment, swatches) → generate with **`frontend-design`**, then
audit with **`impeccable`**, honoring `ui-context.md`: cozy/warm Amber-Ember mood, rounded corners, Inter labels,
visible `focus-visible` rings, swatch buttons with `aria-label`s, toolbar reachable by keyboard, tint legible on
paper/sepia/night. All colors via the new `--color-highlight-*` tokens (invariant #6). Toolbar should feel calm,
not gamified.

## Tests
- `apps/web/src/reader/selection-anchor.test.ts` (jsdom, hand-built span DOM matching a `PageTextGeometry`
  fixture):
  - `charOffsetOf` sums preceding text-node lengths + in-node offset; returns `null` for a node outside `root`.
  - `selectionToTextAnchor`: single-span partial range → correct `startChar`/`endChar`/`quote`
    (`quote === buildPageText(geo).slice(start,end)`); cross-span range; collapsed → `null`; reversed range
    normalizes; range whose end is outside `root` clips `endChar` to text length.
  - `cssRectFromBox` scales a `NormalizedBox` to px.
- `apps/web/src/tests/web-store-annotation.test.ts` (injected store over `MemoryRepository`, fake clock):
  `createAnnotation` returns a valid `Annotation`, writes **one** record + **one** `put` outbox entry
  (`recordId === id`); `listAnnotations(docId)` filters by doc; the record round-trips with the right
  `kind`/`color`/`anchor`.
- `apps/web/src/tests/use-annotations.test.tsx`: hook loads existing annotations grouped by page; `createHighlight`
  persists and appends to `annotationsByPage` without a reload.
- `apps/web/src/tests/highlight-layer.test.tsx`: given a `geometry` + 1 highlight spanning 2 items, renders 2
  positioned rects with the right `--color-highlight-*`/`bg-highlight-*` class and px geometry; renders nothing
  when `geometry` is undefined; ignores `kind:'note'` records.
- `apps/web/src/tests/selection-toolbar.test.tsx`: with a stubbed selection + page DOM + geometry map, clicking a
  swatch calls `onCreate` with the resolved anchor + that color; renders `null` when the selection is collapsed.
- Follow existing reader test patterns (`reader-page.test.tsx`, `pdf-page-geometry.test.tsx`) — do NOT spin up a
  real pdf.js worker; feed geometry/DOM fixtures directly.

## Dependencies
- none new. Reuses `@ember/core` (`makeAnnotation`, `buildPageText`, `resolveAnchorRects`, annotation + geometry
  types) and `@ember/store` (`saveAnnotation`, `listAnnotations`) from 10a, plus the existing web clock/store.

## Verify when done
- [ ] `packages/tokens` exports `highlights` (4 keys) and both CSS files declare `--color-highlight-*`; parity test green.
- [ ] Selecting text in the reader shows a floating 4-swatch toolbar; tapping a swatch creates a highlight in that
      color, which paints over the page and **survives reload** (persisted via the outbox).
- [ ] `selection-anchor.ts` maps a DOM range to `(startChar,endChar)` against `buildPageText`, derives `quote`
      canonically, handles collapsed/reversed/cross-page; it is pure and jsdom-tested (no pdf.js runtime).
- [ ] `HighlightLayer` paints one rect per overlapped item under the text layer (text stays selectable); tint
      legible across paper/sepia/night; only token-driven highlight colors (invariant #6).
- [ ] `web-store.createAnnotation` writes exactly one record + one HLC-stamped `put` outbox entry (invariant #2);
      `listAnnotations(docId)` filters by doc. No edit/delete/note UI (those are 10c).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (existing web/tokens suites + the new selection-anchor/web-store-annotation/
      use-annotations/highlight-layer/selection-toolbar tests)
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (offline; Convex never on the read path — annotations load
      from the local repo), #2 (the create goes through the outbox with an HLC stamp), #6 (highlight colors live in
      tokens, not components); core stays pure (the DOM/selection logic lives in apps/web, never in core).
```