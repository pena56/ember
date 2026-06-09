# Unit 05a: Web PDF reader — scroll + paged + text layer (apps/web)

Issue: #42 (part of umbrella #5) · Branch: feat/42-web-pdf-reader · Boundary: apps/web
Route: standard (UI unit) — single boundary (apps/web), one new external dep (pdfjs-dist), text-layer
extraction is well-trodden pdf.js territory, ambiguity resolved. UI unit → frontend-design then
impeccable before review.

First slice of Unit 05 (split from the build-plan unit, which crosses web+mobile and carried an open
question): **05a** web reader (this) → **05b** mobile reader (react-native-pdf render + headless pdf.js
text extraction, device-bound). Split + open-question resolution recorded in progress-tracker.md
(2026-06-09). Web is first because pdf.js is the more capable text engine and becomes the reference the
mobile text contract is measured against in 05b.

**Resolved open question (2026-06-09, user):** mobile will extract its text layer with the **same pdf.js
engine** (react-native-pdf renders pixels; a headless pdf.js extracts text) → identical extraction logic
both clients = highlight-anchor parity (unit 10) for free. Consequence for 05a: pdf.js text extraction is
the canonical engine, but its text-layer *shape* is NOT promoted to `packages/core` yet — that promotion
happens in 05b once both clients are proven to produce identical geometry, feeding unit 10. 05a keeps its
text-layer code in `apps/web`.

## Goal
Open a PDF from the Library and read it. pdf.js (pdfjs-dist) renders the document with **continuous
vertical scroll by default** and a **paged mode** toggle, lazily rendering only on-screen pages (+ a small
buffer) so large PDFs stay responsive. A selectable **text layer** overlays each rendered page (enables
highlights in unit 10); pages with no embedded text simply render without one. A reader toolbar offers
back-to-Library, a page indicator, the scroll/paged toggle, and a reader theme (paper / sepia / night)
chosen independently of app chrome. No reading-position capture/resume (unit 06) and no highlights
(unit 10) — the reader always opens at page 1.

## Design   (UI unit — frontend-design generates, impeccable polishes, before code-review)
Warm, distraction-free "reading nook." All color/spacing from `@ember/tokens` (invariant #6).
- **Reader surface:** the page column sits on the reader theme background (`reader.bg`), NOT the app
  `surface`. Reader themes (independent of app chrome, per ui-context.md): **paper** `reader-bg`/`reader-text`,
  **sepia**, **night** — token utilities already exist from unit 02 (`bg-reader-bg`, `text-reader-text` +
  the sepia/night selector blocks). Brightness/warmth sliders are a documented leaf-polish — OUT of 05a
  unless trivial as a CSS `filter` (impeccable's call); reader *theme* selection is in scope.
- **Page presentation:** each page centered with generous vertical rhythm between pages in scroll mode;
  one page at a time (centered, fit-to-width) in paged mode with prev/next affordances. Soft page shadow on
  a `surface-raised`-like card edge so pages read as physical paper against the reader bg.
- **Toolbar:** a slim, auto-quieting top bar (does not fight the text): *Ember* brandless back chevron →
  Library, current document title (Fraunces, truncated), `page X of N` indicator (Inter, muted),
  scroll/paged segmented toggle, reader-theme control. Compose shadcn `Button` for actions; the
  mode + theme pickers can reuse the existing segmented-control a11y pattern (`library-page.tsx`
  `ThemeControl`) or a shadcn ToggleGroup — keep `aria-pressed`/focus-visible parity with 02b.
- **Loading / empty:** while the PDF parses, a quiet centered ember spinner (reuse the Library
  `role="status"` pattern). A failed load (corrupt/missing blob) shows a gentle, non-alarming notice with a
  back-to-Library action — warm voice, never a stack trace.

## Implementation
All new files under `apps/web/src/`. pdf.js is web-only (DOM/canvas) so it lives here, not in core/store.

### `src/store/web-store.ts` — expose blob read-back
- Add `getPdfBytes(id: string): Promise<Uint8Array | undefined>` to the `WebStore` interface + factory,
  delegating to `blobs.get(id)` (the `BlobStore` port already has `get`). This is the only store change;
  import/list untouched. Tests inject a `MemoryBlobStore` as today.

### `src/reader/pdf.ts` — pdf.js loader + worker wiring
- Configure the worker for Vite once: `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`
  then `GlobalWorkerOptions.workerSrc = workerUrl` (pdfjs-dist 6 is ESM). Add `pdfjs-dist/build/pdf.worker`
  type handling if TS complains via the `?url` module decl in `vite-env.d.ts`.
- `loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy>` — `getDocument({ data: bytes }).promise`. Caller
  owns `.destroy()` on unmount. Keep this module thin and side-effect-light so it can be `vi.mock`ed.

### `src/reader/use-pdf-document.ts` — load lifecycle
- Hook: given a `docId`, `useWebStore().getPdfBytes(docId)` → `loadPdf(bytes)`; expose
  `{ status: 'loading' | 'ready' | 'error' | 'missing', pdf?: PDFDocumentProxy, numPages }`. `destroy()` the
  proxy on unmount / docId change. `missing` when bytes are `undefined` (blob gone); `error` on parse failure.

### `src/reader/pdf-page.tsx` — one rendered page (canvas + text layer)
- Props: `pdf`, `pageNumber`, `scale`/target width, `active` (whether to actually render — virtualization).
- When `active`: `pdf.getPage(n)` → `getViewport({ scale })` → render to a `<canvas>` (cancel the in-flight
  `RenderTask` on unmount/deps change to avoid pdf.js "canvas already in use"). Overlay the **text layer**:
  `page.getTextContent()` → pdf.js `TextLayer`/`renderTextLayer` into an absolutely-positioned div sized to
  the viewport (selectable, transparent text). If `getTextContent()` yields no items, skip the text layer
  (scanned PDF — pixel/rect fallback is unit 10, not here).
- When NOT `active`: render a placeholder box sized to the page's aspect ratio (from a cheap first-page or
  per-page viewport probe) so scroll height is stable and the scrollbar doesn't jump as pages mount.

### `src/reader/reader-page.tsx` — the screen
- Props: `docId`, `onClose()`. Uses `use-pdf-document` + the document metadata (title) from a passed-in
  `Document` (or look up via list) for the toolbar.
- **Continuous scroll (default):** vertical list of `PdfPage` for `1..numPages`; an `IntersectionObserver`
  (or scroll math) marks pages within the viewport ± a buffer (e.g. ±2) as `active`; others render
  placeholders. The page indicator reflects the most-visible page.
- **Paged mode:** render only the current page (active); prev/next buttons + `←/→` keys change the page;
  page indicator shows `current of N`.
- A `mode` state (`'scroll' | 'paged'`, default `'scroll'`) and a `readerTheme` state
  (`'paper' | 'sepia' | 'night'`, default `'paper'`) drive the toolbar; reader theme sets the
  reader-bg/text utility on the reader root only (does NOT touch the app `data-app-theme`).
- Toolbar back chevron calls `onClose()`. Loading/error/missing states per Design.

### `src/App.tsx` — open/close navigation (no router dep)
- Lift an `openDocId: string | null` state into `App`. `null` → `<LibraryPage onOpen={setOpenDocId} />`;
  set → `<ReaderPage docId={openDocId} onClose={() => setOpenDocId(null)} />`. No react-router — a tabbed
  Today/Library/Stats shell is a later infra unit; a single state switch suffices now (note this in the file).
- `library-page.tsx` / `document-row.tsx`: make a row open its document — add an `onOpen(id)` callback
  threaded from `App` through `LibraryPage`; `DocumentRow` becomes a `<button>`/clickable row (was
  display-only in 04b) with the focus-visible a11y pattern. Keep the recently-added-first list + empty state.

### Tests (`apps/web/src/tests/`, jsdom + RTL + vitest)
- jsdom has no canvas/worker, so **`vi.mock('../reader/pdf.js')`** returns a fake `PDFDocumentProxy`
  (`numPages`, `getPage` → stub with `getViewport`/`render`(resolved task)/`getTextContent` → items). Assert
  reader *behaviour*, not pixels:
  - `reader-page.test.tsx`: renders toolbar with `page 1 of N`; scroll is the default mode; toggling to
    paged shows one page + prev/next; reader-theme control switches paper→sepia→night (`aria-pressed`) and
    does NOT mutate `document.documentElement[data-app-theme]`; `error`/`missing` status renders the gentle
    notice + working back action.
  - `app-navigation.test.tsx` (or extend `library-page.test.tsx`): clicking a `DocumentRow` opens the
    reader (title visible); back returns to the Library with the list intact.
  - One pure helper unit-tested (e.g. `most-visible-page` selection or aspect-ratio placeholder sizing) if
    extracted — keep the math out of the component so it's testable without canvas.
- Real pdf.js render + text-layer selection is **browser-verified** below (jsdom can't run the worker).

## Dependencies
- `pdfjs-dist@6.0.227` (PDF render + text-layer extraction; matches the architecture.md pin, verified
  registry-latest 2026-06-09). Install in `apps/web`. ESM build + a web worker (no build/postinstall script
  → no `allowBuilds` entry needed; confirm `pnpm -w install` doesn't report an ignored build — if it does,
  add `pdfjs-dist` to `allowBuilds` in `pnpm-workspace.yaml` per the 04d carry-forward).
- No router dep (state-based view switch). zod still deferred.

## Verify when done
- [ ] Opening a Library row shows the reader with the PDF rendered; back returns to the Library.
- [ ] Continuous vertical scroll is the default; only on-screen (± buffer) pages render canvases (large
      PDFs stay responsive); the page indicator tracks the visible page.
- [ ] Paged mode renders one page with working prev/next (buttons + ←/→ keys); indicator shows `X of N`.
- [ ] Text is selectable over a text-bearing PDF (text layer present); a scanned/image PDF renders pixels
      with no text layer and no error.
- [ ] Reader theme paper/sepia/night switches the reader background/text independently of app chrome
      (app `data-app-theme` unchanged); a corrupt/missing blob shows a gentle notice, not a crash.
- [ ] UI uses only `@ember/tokens` tokens (invariant #6); row open + toolbar controls keep the 02b
      focus-visible/`aria-pressed` a11y pattern.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (reader works fully offline; bytes come from
      OPFS via `BlobStore`, Convex never on the read path), #6 (tokens). core/store gain no DOM/pdf import;
      the text-layer shape stays in apps/web (not promoted to core until 05b).
- [ ] **BROWSER-VERIFIED (real Chromium, not jsdom):** `pnpm --filter @ember/web dev` → open an imported
      PDF → pages render and scroll smoothly; select text (text layer works); toggle scroll↔paged; switch
      reader theme paper/sepia/night; reload mid-document → reader reopens at page 1 (resume is unit 06);
      a multi-hundred-page PDF scrolls without rendering every page up front.
