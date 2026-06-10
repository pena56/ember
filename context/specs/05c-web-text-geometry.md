# Unit 05c-2: Web text-geometry extraction + golden parity fixture (apps/web)

Issue: #48 (part of umbrella #5) · Branch: feat/48-web-text-geometry · Boundary: apps/web
Route: **standard** — single boundary (apps/web); no new dep (pdfjs-dist 6.0.227 already a web
dep); ambiguity resolved with the user 2026-06-10 (golden source + wiring, see below); the capture
harness mirrors the established `node scripts/*.mjs` precedent (apps/mobile `bundle-pdfjs.mjs`).

## Where this sits in the 05c chain
05c-1 (#46, MERGED) promoted the shared shape + pure `normalizePageText` to `@ember/core`. This slice
makes **apps/web** produce that shape from real pdf.js output and locks the numbers with a committed
golden fixture. 05c-3 (mobile) will later extract the same geometry inside the WebView and assert it is
**byte-identical to this slice's committed golden** — that cross-client diff is the highlight-anchor
parity (unit 10) payoff. So the artifacts this slice commits (`raw-textcontent.json`,
`expected-geometry.json`) are not throwaway test scaffolding — they are the parity contract 05c-3 reuses.

## Design decisions (2026-06-10, user)
- **Golden source = captured from real pdf.js, in Node.** Commit a tiny one-page `sample.pdf`; a
  one-time `node scripts/capture-geometry.mjs` runs **real pdf.js** (legacy Node build) to dump
  `getTextContent()` → `raw-textcontent.json`. The unit test stays pure: it imports the committed JSON,
  runs the adapter + core normalizer, and asserts. The golden reflects real transforms, `hasEOL` spacing
  items, and `TextMarkedContent` markers — not hand-waved values. (Rejected: hand-authored fixture — less
  faithful for a contract mobile will diff byte-for-byte.)
- **Wire into the live render path now, via an optional callback.** `pdf-page.tsx` (which already calls
  `getTextContent()` for its text layer) also builds the geometry and surfaces it through an optional
  `onTextGeometry?(geometry)` prop (no-op if unset). This proves the real pdf.js path produces geometry
  and gives unit 10 its subscription seam. There is no live consumer yet — that is expected; do not invent
  one (forwarding the prop from `reader-page.tsx` to a consumer is unit 10's job, OUT of scope here).

## Implementation

### 1. `apps/web/src/reader/page-geometry.ts` — the web adapter (NEW)
The thin platform-side mapping pdf.js → core's port shape → core normalizer. apps/web MAY import pdf.js,
but keep pdf.js **type-only** here so the adapter is unit-testable without a pdf.js runtime/worker.

- `import type { TextContent, TextItem } from 'pdfjs-dist';`
- `import { normalizePageText, type PageTextGeometry, type RawTextItem } from '@ember/core';`
- **Discriminate TextItem vs TextMarkedContent.** `getTextContent().items` is
  `(TextItem | TextMarkedContent)[]`. `TextMarkedContent` (`{ type, id? }`) carries no `transform`/`str`
  and must be **dropped** (it is a structure marker, not a text run). Filter with a type guard, e.g.
  `(it): it is TextItem => 'transform' in it`. Preserve every remaining `TextItem` in order — including
  empty-`str` / `hasEOL` spacing items (05c-1 contract: faithful char-offset reconstruction for unit 10).
- `function toRawTextItems(items: TextContent['items']): RawTextItem[]` — project each kept `TextItem` to
  `{ str, width, height, transform: it.transform as [number,number,number,number,number,number] }`
  (pdf.js types `transform` as `number[]`; it is always length-6 — assert/cast to the tuple).
- Public entry:
  ```ts
  export function extractPageGeometry(
    pageNumber: number,
    viewport: { width: number; height: number }, // scale-1 page.getViewport({scale:1})
    textContent: Pick<TextContent, 'items'>,
  ): PageTextGeometry {
    return normalizePageText(pageNumber, viewport, toRawTextItems(textContent.items));
  }
  ```
  Pure given its inputs. No DOM, no allocation beyond the map. The `viewport` arg is the **scale-1**
  viewport (PDF points) — the normalizer's contract.

### 2. `apps/web/src/reader/pdf-page.tsx` — wire the callback (EDIT)
- Add to `PdfPageProps`: `onTextGeometry?: (geometry: PageTextGeometry) => void;` (import the type from
  `@ember/core`). Destructure it in the component.
- Inside the existing `active` render effect, in the `getTextContent()` block: right after `textContent`
  resolves and the `if (cancelled) return;` guard — **before** the `items.length > 0` text-layer guard —
  compute geometry and fire the callback so it runs even for text-empty pages:
  ```ts
  const vp1 = pageHandle.getViewport({ scale: 1 });
  onTextGeometry?.(extractPageGeometry(pageNumber, { width: vp1.width, height: vp1.height }, textContent));
  ```
  Keep it inside the existing `try` that already swallows text-layer failures (geometry extraction must
  never break rendering). Add `onTextGeometry` to the effect's dependency array.
- Do **not** thread the prop through `ScrollReader`/`PagedReader`/`ReaderPage` — leave them untouched
  (no consumer this slice). The prop exists on `PdfPage` as the seam.

### 3. `apps/web/scripts/capture-geometry.mjs` — one-time golden generator (NEW)
Mirror `apps/mobile/scripts/bundle-pdfjs.mjs` conventions (Node ESM, `__dirname` via `fileURLToPath`,
clear AUTO-GENERATED header on outputs). Run manually: `node scripts/capture-geometry.mjs`. **Not** wired
into `predev`/`typecheck`/CI — the outputs are committed golden artifacts, regenerated only intentionally.
- Import the **legacy Node build**: `pdfjs-dist/legacy/build/pdf.mjs` (runs in Node; `getTextContent()`
  needs no canvas — only rendering would). Set `GlobalWorkerOptions.workerSrc` to the legacy worker, or
  use `getDocument({ data, useWorkerFetch:false, isEvalSupported:false })` with the worker disabled —
  whichever the executor verifies runs clean headless.
- Load `test-fixtures/sample.pdf`, `getPage(1)`, `vp = getViewport({scale:1})`, `tc = getTextContent()`.
- Write `test-fixtures/raw-textcontent.json` =
  `{ pageNumber: 1, viewport: { width: vp.width, height: vp.height }, items: tc.items }`
  (serialize items verbatim — keep `str`, `width`, `height`, `transform`, `hasEOL`, and any
  `TextMarkedContent` `type` markers, so the adapter's filtering is genuinely exercised).
- Write `test-fixtures/expected-geometry.json` = `extractPageGeometry(1, vp, tc)` output. **Tautology
  guard:** because this generator produces the golden with the same adapter the test re-runs, the snapshot
  alone only catches *regressions*. Correctness of the golden itself is pinned by the **independent
  hand-computed spot-checks** in the test (below) + 05c-1's hand-verified core math. State this in a
  comment in both the script and the test.

### 4. `apps/web/test-fixtures/sample.pdf` — committed fixture (NEW, binary)
A tiny, deterministic, single-page text PDF. Requirements:
- At least **two text runs at known positions**, including one near the **top** and one near the
  **bottom** of the page, so the y-flip is exercised by real data.
- Small (a few KB). Committed (NOT gitignored — it is golden input).
- The executor may hand-author a minimal uncompressed PDF (BT/Tj text operators); pdf.js tolerates an
  imperfect xref (it reconstructs). Verify `node scripts/capture-geometry.mjs` extracts ≥2 items from it.

### 5. Fixtures are committed, not generated-at-build
Add nothing to `.gitignore` for `test-fixtures/`. (Contrast mobile's `pdf-js-content.ts`, which is
gitignored because regenerated from `node_modules`; here the captured JSON + PDF ARE the golden.)

## Tests (`apps/web/src/reader/page-geometry.test.ts` + a `pdf-page` wiring test, vitest)
Pure — read the committed JSON via `import` (or `fs`); NO pdf.js runtime in the test.
**Adapter / golden (`page-geometry.test.ts`):**
- **Golden snapshot:** `extractPageGeometry(1, raw.viewport, raw)` `toEqual` `expected-geometry.json`
  (the regression lock + the artifact 05c-3 diffs against).
- **Independent spot-checks (validate the golden, not just its self-consistency):** for ≥2 specific known
  items, hand-compute the expected normalized box from `raw` (`x = transform[4]/vp.width`,
  `y = (vp.height - (transform[5] + height))/vp.height`, etc.) and assert the adapter output matches —
  including that the **top** run yields a small `y` and the **bottom** run a large `y`.
- **TextMarkedContent is filtered:** the output item count equals the number of `TextItem`s in `raw`
  (strictly fewer than `raw.items.length` if the fixture contains a marker), and indices are contiguous
  0..n-1 in reading order.
- **Preservation:** every kept item's `str` and order matches `raw` (incl. an empty/`hasEOL` item if
  present); `pageNumber === 1`.
**Wiring (`pdf-page.test.tsx`, or an added case — reuse the reader-page test's pdf.js mock pattern):**
- Mount `PdfPage` `active` with a fake `pdf` proxy whose `getTextContent()` returns a known item and
  `getViewport({scale:1})` known dims; assert `onTextGeometry` is called with the matching
  `PageTextGeometry` (right `pageNumber`, item `str`, normalized box). Mock `pdfjs-dist`/`TextLayer` as the
  existing `reader-page.test.tsx` does (jsdom has no canvas/worker).

## Dependencies
- none new. pdfjs-dist 6.0.227 is already an apps/web dependency; `@ember/core` provides
  `normalizePageText` + types. The capture script uses pdfjs-dist's legacy build in Node.

## Verify when done
- [ ] `extractPageGeometry` drops `TextMarkedContent`, preserves all `TextItem`s in order, and returns
      the core `PageTextGeometry` shape from real captured pdf.js output.
- [ ] Golden test passes against committed `expected-geometry.json`; independent hand-computed spot-checks
      pass (top→small y, bottom→large y); these confirm the golden, not just its self-consistency.
- [ ] `pdf-page.tsx` fires `onTextGeometry` from the live render path with correct geometry; rendering is
      unaffected when the prop is unset; geometry failure never breaks the canvas/text layer.
- [ ] `sample.pdf`, `raw-textcontent.json`, `expected-geometry.json` are committed (not gitignored);
      `node scripts/capture-geometry.mjs` regenerates them deterministically.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (existing web tests + new adapter/golden/wiring tests)
- [ ] `pnpm -w lint` clean — incl. the new `scripts/*.mjs` (mirror how mobile's eslint config handles its
      Node `scripts/*.mjs`; ignore or make it pass, do not leave it erroring).
- [ ] No invariant in architecture.md violated. Core stays untouched & pure (pdf.js lives only in
      apps/web; the adapter imports pdf.js **type-only**). The committed golden is now the parity contract
      05c-3 will diff against byte-for-byte.
