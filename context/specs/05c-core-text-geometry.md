# Unit 05c-1: Shared text-layer geometry shape + normalizer (packages/core)

Issue: #46 (part of umbrella #5) · Branch: feat/46-core-text-geometry · Boundary: packages/core
Route: **standard** — single boundary (packages/core), no new dep, contained well-trodden logic,
ambiguity resolved (shape + coordinate model chosen with the user 2026-06-10).

## Why this is a slice, not the whole unit
Build-plan Unit 05c (structured text-geometry extraction + promote the shared text-layer shape to
core) scored **COMPLEX** — it crosses three boundaries (core shape, web extraction, mobile
WebView→RN bridge) and the shape was undesigned. Split by boundary, mirroring 03a/b/c and 05a/b:

- **05c-1 (this)** — the pure shared *shape* + a pure `pdf.js → shape` normalizer in `packages/core`,
  with fixture-based unit tests. No client touched. Promotes the unit-10 parity contract to core.
- **05c-2** — `apps/web`: build `RawTextItem`s from pdf.js `getTextContent()` in `pdf-page.tsx`, run
  them through the core normalizer, and assert the output against a captured golden fixture.
- **05c-3** — `apps/mobile`: extract the same geometry inside the WebView, bridge it to RN, and prove
  it is byte-identical to the web golden (device-bound). This is the literal "highlight-anchor parity"
  payoff that unblocks unit 10.

05c-1 is the foundation both later slices and unit 10 depend on. It is pure TS — no DOM, no pdf.js
import, no platform API (core invariant), so it is fully unit-testable without a browser/WebView.

## Design decisions (2026-06-10, user — drive the shape)
- **Granularity: per-item.** One entry per pdf.js `TextContent` item (a text run), carrying its text,
  its bounding box, and its reading-order index. Unit 10 resolves a `(page, startChar, endChar)` anchor
  to highlight rectangles from these items; per-glyph boxes are heavier and deferred unless unit 10
  needs them.
- **Coordinates: normalized 0..1 of the page, top-left origin, y growing down.** Each box is expressed
  as fractions of page width/height. Device/scale/viewport-independent ⇒ web and mobile feeding the
  same pdf.js output through this function produce **identical** numbers (the parity property), and it
  is consistent with the architecture's reading-position model ("relative offset maps across viewports").
- **Parity-by-construction:** because both clients call this one pure function with the same pdf.js
  inputs, identical geometry is guaranteed by construction; 05c-2/05c-3 only have to verify the inputs
  match. That is why the function lives in core, not duplicated per client.

## Implementation
One new file + one barrel line. No platform import (core invariant; mirrors `document.ts`).

### `packages/core/src/text-geometry.ts` — the shape + normalizer

**Output shape (the promoted contract):**
- `NormalizedBox` — `{ x: number; y: number; width: number; height: number }`, each a fraction of the
  page (0..1), top-left origin, y down. Document the origin/units in a comment.
- `TextItemGeometry` — `{ index: number; str: string; box: NormalizedBox }`. `index` is the 0-based
  reading-order position on the page (the order pdf.js yields items). Keep ALL items pdf.js returns,
  including empty/`hasEOL` spacing items, so a later concatenation + char-offset reconstruction
  (unit 10) is faithful.
- `PageTextGeometry` — `{ pageNumber: number; items: TextItemGeometry[] }`. `pageNumber` is 1-based.

**Input shape (a minimal structural projection of pdf.js — NOT a pdf.js import):** the platform layer
builds these from pdf.js in 05c-2/05c-3; core stays dep-free, mirroring the `Hasher`/`SqliteDriver`
port pattern.
- `RawTextItem` — `{ str: string; width: number; height: number; transform: [number, number, number,
  number, number, number] }`. `width`/`height` and `transform` are pdf.js `TextItem` fields taken at
  the **scale-1** viewport (PDF user space, bottom-left origin). `transform` is `[a,b,c,d,e,f]`; the run
  origin is `(e, f)`.
- `RawPageViewport` — `{ width: number; height: number }`, the scale-1 `page.getViewport({scale:1})`
  dimensions (PDF points, bottom-left origin).

**Normalizer:**
```ts
export function normalizePageText(
  pageNumber: number,
  viewport: RawPageViewport,
  rawItems: readonly RawTextItem[],
): PageTextGeometry
```
Per item, non-rotated text (the common case — document rotation/skew handling is OUT of 05c-1, note it):
- `left = transform[4]` (= e); `baseline = transform[5]` (= f) in bottom-left PDF space.
- `h = height` (run height in PDF units); `w = width`.
- Convert to top-left origin: `topPdf = viewport.height - (baseline + h)`.
- Normalize: `x = left / viewport.width`, `y = topPdf / viewport.height`,
  `width = w / viewport.width`, `height = h / viewport.height`.
- `index` = position in `rawItems`; `str` passes through verbatim.
- **Guard divide-by-zero:** if `viewport.width` or `viewport.height` is `0`, emit a zeroed box rather
  than `NaN`/`Infinity` (a malformed page must not poison the shape).
Keep it a pure, deterministic, allocation-light map — no `Date`, no randomness, no I/O.

### `packages/core/src/index.ts` — barrel
- Add `export * from './text-geometry.js';` (NodeNext `.js` convention, as the existing lines).

## Tests (`packages/core/src/tests/text-geometry.test.ts`, vitest)
Pure — hand-built `RawTextItem`/`RawPageViewport` fixtures, NO pdf.js dependency:
- A run at the page's **bottom-left** (small `f`) normalizes to a box near `y≈1` (top-left origin flip
  is correct); a run near the **top** (large `f`) → `y≈0`.
- Width/height normalize to the correct fractions of the page (e.g. a `100`-wide run on a `500`-wide
  page → `box.width === 0.2`).
- `index` reflects input order; `str` is preserved exactly, including an empty-string spacing item.
- Coordinate **independence**: scaling the page viewport AND the items by the same factor (simulating a
  different render scale) yields the **same normalized boxes** — this is the parity property 05c-2/3 rely on.
- Zero-dimension viewport → zeroed boxes, no `NaN`/`Infinity`.
- Empty `rawItems` → `{ pageNumber, items: [] }`.

## Dependencies
- none. (pure TS; core imports no runtime dep — invariant. No pdfjs-dist in core.)

## Verify when done
- [ ] `normalizePageText` produces normalized 0..1 top-left-origin boxes; bottom-left/top runs flip
      correctly; render-scale-independent (same boxes regardless of viewport scale).
- [ ] All pdf.js items (incl. empty/EOL) are preserved, in order, with their `index` and `str`.
- [ ] The shape is exported from `@ember/core`'s barrel and importable as `@ember/core`.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (existing core tests + the new text-geometry tests)
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. core purity (no DOM/pdf.js/platform import in
      core; `packages/store`, `apps/web`, `apps/mobile` untouched this slice). The shape is now the
      single shared contract both clients will conform to in 05c-2/05c-3 (and unit 10 anchors against).
</content>
</invoke>
