# Unit 10d: mobile reader — highlight create + render (WebView selection bridge + paint layer)

Issue: #92 (part of umbrella Unit 10) · Branch: feat/92-mobile-highlight-create-render · Boundary: apps/mobile ONLY
Route: standard — one client boundary; the shared brain is done (10a: core `makeAnnotation`/`resolveAnchorRects`/
`buildPageText`, store `saveAnnotation`/`listAnnotations`), the palette tokens exist (10b: `--color-highlight-*`).
No new dep (`react-native-webview` already present). Product forks resolved with user (10b/10c). Mirrors web 10b.

Fourth slice of umbrella Unit 10, first mobile slice. **10d makes highlights creatable + visible in the
mobile reader.** Edit/recolor/delete + standalone notes/pins = 10e (mirror of 10c).
First verifiable result: *select text in the mobile reader → tap a color → highlight paints → reopen the
doc → it is still there.*

## The platform shift (read first)
The mobile reader is pdf.js running **inside a WebView** (`build-reader-html.ts` → `reader-webview.tsx`). The
pages, text layer, and DOM selection all live inside the WebView; RN (Expo/uniwind) only owns the chrome and
the store. So 10d splits cleanly along the bridge:

- **DOM-side work (inside the HTML string)** — selection capture, char-offset computation, and painting rects
  live in the WebView, because that's the only place with the page DOM. The HTML has **no token pipeline and no
  `@ember/core`** (same constraint as the existing `READER_PALETTE`), so it stays a *dumb painter + selection
  reporter*: it never computes a `quote`, never resolves anchor→rect math.
- **RN-side work** — anything that needs `@ember/core` or tokens: deriving the `quote` + `TextAnchor` from
  posted offsets, resolving annotation char-ranges → normalized boxes (`resolveAnchorRects`), the native swatch
  toolbar (uniwind token colors), and the store mutation. RN posts resolved boxes back down for paint.

This keeps the rect/anchor math single-sourced in core (parity with web — invariant-#5 spirit) and `@ember/core`
out of the inlined HTML.

## Product decisions (confirmed with user — carried from 10b)
- **Create affordance = floating 4-swatch toolbar** over the selection (yellow/green/blue/pink). Tapping a swatch
  creates a `kind:'highlight'` annotation and clears the selection. (The **Note** button + standalone notes are
  10e, per 10b's deferral.)
- **Text-anchored, single-page** highlights only (umbrella-wide decision; scanned-PDF pixel fallback deferred).
- **Edit/recolor/delete deferred to 10e.** 10d is create + render + reload-survival only. A painted highlight is
  not yet tappable-to-edit (10e adds that bridge message).

## Bridge protocol additions
Extend the existing RN↔WebView message set (today: load/setMode/setTheme/gotoPage ↔ bootReady/ready/page/
position/stage/error/geometry). Add:

**WebView → RN**
- `{ type:'selection', page, startChar, endChar, rect:{ x, y, width, height } }` — posted on selection-settle
  when a non-collapsed selection lies within one page's text layer. `startChar`/`endChar` are offsets into THAT
  page's text-layer text (DOM TreeWalker sum — the same algorithm as web's `charOffsetOf`, inlined in vanilla
  JS). `rect` is the selection's bounding box in **WebView-viewport CSS px** (`range.getBoundingClientRect()`),
  for positioning the native toolbar. No `quote` (RN derives it).
- `{ type:'selectionCleared' }` — posted when the selection collapses/clears (dismiss the toolbar).

**RN → WebView**
- `{ type:'setAnnotations', items:[ { id, page, kind, color, boxes:[ { x, y, width, height } … ] } ] }` —
  RN-resolved normalized boxes (fractions of page dims, from `resolveAnchorRects`) for every annotation whose
  page geometry is known. The WebView stores them keyed by page and (re)paints on each page render. Posted
  whenever the annotation set or known geometry changes; gated on `bootReady` like every other RN→WebView post.
- `{ type:'clearSelection' }` — RN asks the WebView to drop the active DOM selection after a highlight is
  created (so the toolbar dismisses and the just-highlighted text deselects).

## Implementation — `apps/mobile` (the only boundary)

### `apps/mobile/src/store/native-store.ts` — facade additions (only store-surface change)
Mirror web-store exactly; the store is the single place the clock is read; **one create = one `nextStamp()`
shared by `makeAnnotation` and its single outbox entry** (invariant #2). Import `makeAnnotation` from
`@ember/core` and `saveAnnotation`/`listAnnotations` from `@ember/store`.
- `createAnnotation(input: { docId; kind: AnnotationKind; anchor: TextAnchor; color?: HighlightColor; note?:
  string }): Promise<Annotation>` — verbatim shape of web-store's `createAnnotation` (read `const hlc =
  clock.nextStamp()`; build via `makeAnnotation({ id: clock.newId(), …, createdAt: clock.now() }, { hlc })`;
  `return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, annotation)`).
- `listAnnotations(docId: string): Promise<Annotation[]>` — `listAnnotations(repo, docId)` sorted by `createdAt`
  ascending (verbatim from web-store).
- Add both to the `NativeStore` interface. `update`/`delete` are 10e — do not add them here yet.

### `apps/mobile/src/reader/annotation-anchor.ts` — RN-side pure helpers (new)
Pure, `@ember/core`-only, no RN/DOM — fully vitest-testable.
- `anchorFromSelection(input: { page; startChar; endChar; geometry: PageTextGeometry }): TextAnchor | null` —
  order-normalize, return null when `startChar === endChar`, derive `quote = buildPageText(geometry).slice(sc,
  ec)`, return `{ kind:'text', page, startChar: sc, endChar: ec, quote }`. (This is the RN half of web's
  `selectionToTextAnchor`: the WebView already did the DOM walk; RN only does the core-dependent `quote`.)
- `boxesForAnnotation(annotation: Annotation, geometry: PageTextGeometry): NormalizedBox[]` — thin wrapper over
  `resolveAnchorRects(annotation.anchor, geometry)` (boxes are already page-fraction normalized — exactly the
  `{x,y,width,height}` the WebView paints with). Used to build `setAnnotations.items`.

### `apps/mobile/src/reader/use-annotations.ts` — load + create hook (new, mirrors web)
Mirror web's `useAnnotations` shape, minus update/remove (10e). `const { store } = useNativeStore()` (note the
`{store}` gate — native store may be null at first render, see 09c/08c precedent).
- State: flat `Annotation[]`; load via `store.listAnnotations(docId)` on mount/docId change with a `cancelled`
  guard; load failure non-fatal (reader still works, highlights just don't show).
- Expose `annotations` (flat) + `annotationsByPage` (regrouped each render) + `createHighlight(input: { anchor:
  TextAnchor; color: HighlightColor }): Promise<Annotation>` (calls `store.createAnnotation({ docId,
  kind:'highlight', anchor, color })`, appends optimistically, returns the record). `?.`/null-store guard so the
  hook is inert until the store is ready.

### `apps/mobile/src/reader/highlight-paint.ts` — RN→WebView paint-item builder (new, pure)
`buildSetAnnotationsMessage(annotations: Annotation[], geometryByPage: Map<number, PageTextGeometry>): { type:
'setAnnotations'; items: PaintItem[] }` where `PaintItem = { id; page; kind; color; boxes: NormalizedBox[] }`.
Skips annotations whose page geometry is unknown (resolved + re-posted once that page's geometry arrives).
Pure + vitest-testable — keeps the message shape under test without a device.

### `apps/mobile/src/reader/build-reader-html.ts` — selection bridge + paint layer (in-HTML JS)
Add to the inlined reader script (vanilla JS — no imports, no tokens; follow the existing `READER_PALETTE`
hardcode-with-parity-comment convention):
- **Highlight palette constant** — `HIGHLIGHT_HEX = { yellow,green,blue,pink }` hardcoded to the *same* hex as
  `--color-highlight-*` in `packages/tokens/src/theme.uniwind.css`, with a `// must match …` parity comment
  (identical pattern to `READER_PALETTE`). Per-theme composite blend hardcoded too: `mix-blend-mode: multiply`
  on paper/sepia, `screen` on night (matches 10b's `--highlight-blend`), toggled off `data-reader-theme`.
- **Selection capture** — on `selectionchange` (debounced ~250 ms) / `touchend`, read `window.getSelection()`.
  If collapsed → post `selectionCleared`. Else find the `.textLayer` ancestor of the anchor; resolve its
  `.page-wrap`'s `data-page` → `page`; compute `startChar`/`endChar` by the TreeWalker-sum over that text layer
  (inline the `charOffsetOf` algorithm); if start/end land in different pages' layers, clip end to that page's
  text length (mirror web's cross-page handling) or bail. Post `{ type:'selection', page, startChar, endChar,
  rect: range.getBoundingClientRect() }`.
- **Paint layer** — keep a module-level `annotationsByPage` map (set from `setAnnotations`). Add a
  `paintAnnotations(pageNum, wrapEl)` that clears prior `.ember-hl` nodes in that wrap and appends one
  absolutely-positioned `<div class="ember-hl">` per box (`left: box.x*W`, `top: box.y*H`, `width`/`height`
  likewise; background = `HIGHLIGHT_HEX[color]` at ~50% alpha; the per-theme blend; `pointer-events:none` for
  10d — tap-to-edit is 10e; `border-radius:2px`). Call `paintAnnotations` at the END of `renderPage` (so lazily
  virtualized pages paint when they render) and immediately for already-rendered pages when `setAnnotations`
  arrives.
- **Handle the two new RN→WebView messages** in `handleMessage`: `setAnnotations` (store + repaint rendered
  pages) and `clearSelection` (`window.getSelection().removeAllRanges()`).

### `apps/mobile/src/reader/reader-webview.tsx` — wire the bridge
- Extend `WebViewInMessage` with `selection` + `selectionCleared`; add props `onSelection?: (s: { page; startChar;
  endChar; rect }) => void` and `onSelectionCleared?: () => void`; route them in `handleMessage`.
- Add a `setAnnotations` post effect: a new prop `paintMessage: { type:'setAnnotations'; items } | undefined`
  posted to the WebView when it changes, **gated on `bootReadyRef`** (mirror the `resumeTo` effect exactly) and
  re-flushed on `bootReady`. Add an imperative `clearSelection()` — simplest: a `clearSelectionSignal` counter
  prop posted on change (same gated-effect pattern), or expose via ref. Use the counter-prop pattern to stay
  consistent with the existing declarative posts.

### Wiring — `apps/mobile/src/reader/reader-screen.tsx`
- Pull `annotations`, `annotationsByPage` (unused in 10d render but cheap), `createHighlight` from
  `useAnnotations(docId)`.
- **Collect geometry**: hold `geometryByPage` state; pass `onTextGeometry={(g) => setGeometryByPage(prev => …)}`
  to `<ReaderWebView>` (the prop already exists but was never wired). Recompute `paintMessage =
  buildSetAnnotationsMessage(annotations, geometryByPage)` (memoized) and pass it down.
- **Selection state**: hold `selection: { anchor: TextAnchor; rect } | null`. On `onSelection`, derive
  `geometry = geometryByPage.get(page)`; if present, `anchor = anchorFromSelection({ page, startChar, endChar,
  geometry })`; set `selection` when non-null. On `onSelectionCleared`, clear it.
- Render the **native** `<SelectionToolbar>` (below) as an absolutely-positioned overlay inside the content
  `<View>` (which sits under the WebView), positioned from `selection.rect` (WebView-viewport px → overlay px;
  the WebView fills the content View so coords align — clamp horizontally within the View width, place above the
  rect, fall back to below near the top edge). On swatch tap: `await createHighlight({ anchor, color })`, clear
  `selection`, bump the `clearSelectionSignal` so the WebView drops its DOM selection.
- Threading is local to the screen — no change to load/resume/session/page-count paths (additive only).

### `apps/mobile/src/reader/selection-toolbar.tsx` — native swatch toolbar (new UI)
RN/uniwind floating card: a row of 4 round swatches (`bg-highlight-yellow|green|blue|pink`) on a
`bg-surface-raised` rounded card with `border-line` + shadow. Each swatch is a `Pressable` with
`accessibilityRole="button"` + `accessibilityLabel={`Highlight ${color}`}` and a pressed-opacity style. Props
`{ colors: HighlightColor[]; onPick: (c: HighlightColor) => void; style }` (absolute position passed by the
screen). Token colors only (invariant #6).
- **Safelist gotcha (08c/09f carry-forward):** if any `bg-highlight-*` class is referenced only dynamically (not
  as a literal), add it to the `@source inline(...)` list in `apps/mobile/global.css` and restart Expo
  `--clear`. Prefer literal class names per color so Tailwind's content scan emits them.

## Design quality (UI unit — runs in the executor step, before review)
Net-new UI = the native selection toolbar (+ the in-HTML highlight tint). Generate the toolbar with
**`frontend-design`**, audit with **`impeccable`**, honoring `ui-context.md`: warm Amber-Ember mood, rounded
card, swatches large enough for a comfortable touch target (≥36–44 px), pressed feedback, every swatch
`accessibilityLabel`-ed. The tint must read legibly on paper/sepia/night (the per-theme blend handles this —
verify on device). All RN colors via tokens; the in-HTML hex is the documented WebView exception (parity
comment, like `READER_PALETTE`).

## Tests (vitest; pure helpers only — no headless RN renderer, no real pdf.js)
- `native-store-annotation.test.ts` (new): `createAnnotation` writes **one** record + **one** `put` outbox entry
  with the shared HLC stamp; `listAnnotations` returns createdAt-ascending. MemoryRepository + a fake clock —
  mirror `native-store-session.test.ts` / web's `web-store-annotation.test.ts`.
- `annotation-anchor.test.ts` (new): `anchorFromSelection` order-normalizes, returns null on empty range, derives
  `quote` from `buildPageText().slice` (feed a hand-built `PageTextGeometry`); `boxesForAnnotation` returns the
  resolver's boxes.
- `highlight-paint.test.ts` (new): `buildSetAnnotationsMessage` emits one item per annotation with known
  geometry, skips unknown-geometry pages, carries id/page/kind/color + resolved boxes.
- `build-reader-html.test.ts` (extend if present, else new): the generated HTML string contains the selection
  handler + paint hooks + the highlight palette (assert on substrings — the same way reader-html is asserted
  today); `HIGHLIGHT_HEX` values equal the tokens' `--color-highlight-*`.
- The hook, the WebView bridge wiring, the toolbar overlay, and the in-HTML paint are **device-verified, not
  unit-tested** (no headless RN renderer / no real WebView — 05a/07c/08c/09c precedent).

## Dependencies
- none new. `react-native-webview` already present; reuses 10a's core (`makeAnnotation`/`resolveAnchorRects`/
  `buildPageText`) + store (`saveAnnotation`/`listAnnotations`) and 10b's `--color-highlight-*` tokens. No
  core/store/tokens **package** change (only the apps/mobile facade + reader files).

## Verify when done
- [ ] Selecting text in the mobile reader shows the native swatch toolbar; tapping a color paints the highlight
      and **survives reopening the document** (one HLC-stamped outbox entry per create — invariant #2).
- [ ] Highlights paint at the correct rects in **both** scroll and paged modes, on lazily-rendered pages, and
      stay legible on paper/sepia/night (per-theme blend).
- [ ] `native-store.createAnnotation`/`listAnnotations` write/read exactly as web-store does; no core/store/
      tokens package source changed (apps/mobile-only diff).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (new pure-helper + native-store suites)
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (offline; annotations load + mutate via the local repo,
      Convex never on the path), #2 (every create = one HLC-stamped outbox entry), #6 (RN colors from tokens;
      the in-HTML hex is the documented WebView exception, parity-commented to the tokens).
- [ ] **DEVICE-VERIFY (user, Expo Go, before merge):** open a text PDF → drag-select text → toolbar appears →
      tap each color → tint paints → switch scroll/paged + paper/sepia/night (tint legible in all) → fully
      reload the app, reopen the doc → highlights persist (real SQLite + paint-on-render).
