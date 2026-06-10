# Unit 05b: Mobile PDF reader — pdf.js in a WebView (apps/mobile)

Issue: #44 (part of umbrella #5) · Branch: feat/44-mobile-pdf-reader · Boundary: apps/mobile
Route: **standard** — single boundary (apps/mobile); one new dep (`react-native-webview`, bundled in
Expo Go); the render engine is pdf.js (already proven in 05a), reused inside a WebView; ambiguity
resolved (engine + scope chosen with the user 2026-06-09). UI unit → frontend-design / impeccable
before code-review.

Second slice of Unit 05 (after 05a web). **05c** follows: structured text-geometry extraction across
the RN↔WebView bridge + promoting the shared text-layer *shape* to `packages/core` (the unit-10
highlight-anchor parity piece). 05b renders + reads only.

## Engine decision (2026-06-09, user — supersedes the architecture.md pin)
The `react-native-pdf` pin predates the resolution of the mobile-text-extraction open question. Re-confirmed
with the user: **render pdf.js inside `react-native-webview`** instead.
- **One engine** for render AND text → exact parity with the 05a web reader; highlight anchors (unit 10)
  fall out for free in 05c (the literal goal of the resolved open question — achieved more directly than
  `react-native-pdf` + a separate headless pdf.js).
- **Stays in Expo Go** — `react-native-webview` ships inside the Expo Go binary; no custom dev client / EAS
  build needed (which `react-native-pdf`, a native module, would have forced).
- Trade-off accepted: WebView scroll/zoom feel + a small RN↔WebView bridge, vs. native render perf.
- **Action:** update `architecture.md` PDF (mobile) row from `react-native-pdf` to "pdf.js (in a WebView via
  react-native-webview)"; mark the mobile-text-extraction Open Question fully resolved. Do this in the 05b PR.

## Goal
Tap a document in the mobile Library and read it. A `react-native-webview` hosts a self-contained pdf.js
reader (the same pdfjs-dist@6.0.227 as web) that renders the PDF with **continuous vertical scroll by
default** and a **paged mode** toggle, rendering lazily so large PDFs stay responsive. A **reader theme**
(paper / sepia / night) chosen independently of app chrome themes the page surface inside the WebView. A
native uniwind toolbar (back, title, `page X of N`, mode toggle, theme control) frames the WebView. No
reading-position capture/resume (unit 06) and no highlight anchors (unit 10) — opens at page 1. Works fully
offline: bytes come from `ExpoFileSystemBlobStore` (invariant #1), never the network.

## Architecture of the split (where each piece lives)
- **Native (RN/uniwind):** navigation, toolbar chrome, reader-theme + mode state, loading/error/missing
  states, reading the blob bytes from the store, handing them to the WebView, receiving page/ready/error
  messages back.
- **WebView (HTML + pdf.js):** the render surface only — receives bytes + theme + mode via the bridge,
  renders canvases + (invisible, selectable) text layer reusing 05a's `.textLayer` CSS approach, posts back
  `ready { numPages }`, `page { current }`, and `error`. This HTML reader is the mobile analogue of 05a's
  `reader-page` render loop, authored as a static asset (no React inside the WebView).
- **No `packages/core` / `packages/store` changes** beyond the one additive `getPdfBytes` on the native
  store surface. The text-layer *shape* is NOT promoted yet (that is 05c).

## Design (UI unit — frontend-design generates, impeccable polishes, before code-review)
Warm, distraction-free reading nook, matching 05a's intent on a phone. All color/spacing from
`@ember/tokens` (invariant #6).
- **Native toolbar (app chrome):** slim top bar using app-chrome tokens (`bg-surface`/`text-text`/
  `border-line`) — NOT reader tokens, because uniwind has no paper/sepia/night theme axis (only the static
  paper default exists; `theme.uniwind.css:18` notes per-reader-theme switching is this unit). Reader theme
  lives inside the WebView. Contents: back chevron → Library (Pressable, accessibilityRole button), document
  title (Fraunces, `numberOfLines={1}`), `page X of N` (Inter, muted, `accessibilityLiveRegion` "polite" only
  in paged mode — mirror 05a's a11y fix where scroll mode would spam the live region), scroll/paged segmented
  control + reader-theme segmented control (reuse the Library `ThemeControl` segmented pattern:
  `accessibilityRole="radiogroup"`/`radio` + `accessibilityState.checked` + accent underline on active).
- **Reader surface (inside WebView):** page column on the reader-theme background (paper/sepia/night), pages
  centered with generous vertical rhythm in scroll mode, one fit-to-width page in paged mode. Soft page-edge
  so sheets read as physical paper on all three themes (the 05a `border-line`-equivalent hairline; use the
  reader palette values, not app `line`).
- **Loading / error / missing (native):** quiet centered ember spinner reusing the Library
  `ActivityIndicator` + token-resolved accent tint pattern (`useResolveClassNames('bg-accent')`). A failed or
  missing blob shows a gentle, warm notice (not a stack trace) with a back-to-Library action — mirror 05a's
  `DocumentNotice` voice. Branded `EmberFlame` motif (already in `src/library/ember-flame.tsx`), dimmed.

## Implementation
All new files under `apps/mobile/`. The WebView HTML reader is the only non-RN artifact.

### `src/store/native-store.ts` — expose blob read-back
- Add `getPdfBytes(id: string): Promise<Uint8Array | undefined>` to the `NativeStore` interface + factory,
  delegating to `blobs.get(id)` (the injected `BlobStore` already has `get`). This is the ONLY store change;
  `importPdf`/`listDocuments` untouched. Tests inject `MemoryBlobStore` as today. (Exact mirror of 05a's
  `web-store.getPdfBytes`.)

### `assets/reader/` — the WebView pdf.js reader (static asset)
- A self-contained `index.html` + reader JS that loads pdf.js and renders pages. pdf.js comes from
  `pdfjs-dist@6.0.227` (add to apps/mobile so the version is pinned identically to web). Bundle the needed
  build files (`pdf.mjs`, `pdf.worker.mjs`) into the asset dir at build time (a small `predev`/`build` copy
  script or a metro asset import — executor picks the mechanism that resolves cleanly; **validate against the
  react-native-webview + expo-asset official docs**, per the mobile "official docs not memory" process rule).
- Load into the WebView via `expo-asset` → resolve the bundled `index.html` URI → `WebView source={{ uri }}`.
  Set `originWhitelist={['*']}`, `allowFileAccess`, `javaScriptEnabled`, `allowsInlineMediaPlayback`; on iOS
  pass `allowingReadAccessToURL` for the asset dir. (If asset-dir file resolution proves fiddly cross-platform,
  fallback: `source={{ html, baseUrl }}` with pdf.js injected — document whichever ships.)
- **Bridge (RN → WebView):** post `{ type:'load', bytesBase64 }` (reuse the established base64 path —
  `pick-pdf.ts` already round-trips base64; pdf.js `getDocument({ data })`), `{ type:'setMode', mode }`,
  `{ type:'setTheme', theme }`, `{ type:'gotoPage', page }`. Base64-over-`postMessage` is the primary path
  (no file-origin CORS pain); a `file://`-streaming optimization for very large PDFs is a documented later
  perf note, OUT of 05b.
- **Bridge (WebView → RN):** `window.ReactNativeWebView.postMessage` with `{ type:'ready', numPages }`,
  `{ type:'page', current }` (most-visible page in scroll mode; current in paged), `{ type:'error' }`.
- The reader theme is applied inside the HTML by toggling `data-reader-theme` + the reader palette CSS vars
  (paper/sepia/night values copied from `ui-context.md` / tokens). The `.textLayer` structural CSS from 05a
  (`apps/web/src/styles.css`) is reused so text is transparent + selectable; `--total-scale-factor` set per
  page exactly as 05a's `pdf-page.tsx` does. (Text is present for selection; EXTRACTING its geometry to RN is
  05c.)

### `src/reader/reader-webview.tsx` — the WebView wrapper component
- Props: `bytes` (or a `getBytes` thunk), `mode`, `readerTheme`, `onReady(numPages)`, `onPageChange`,
  `onError`. Owns the `WebView` ref, posts mode/theme/bytes in, parses `onMessage` out. Keep platform glue
  here so the screen stays declarative.

### `src/reader/reader-screen.tsx` — the screen (native chrome + WebView)
- Props: `docId`, `title`. Uses `useNativeStore()` → `getPdfBytes(docId)` with a cancel guard
  (loading→ready→error/missing, mirroring 05a's `use-pdf-document`); `missing` when bytes are `undefined`,
  `error` on read/parse failure (WebView posts `error`). Holds `mode` ('scroll' default) and `readerTheme`
  ('paper' default) state; renders the native toolbar + `ReaderWebView` content area + loading/notice states.
  Reader theme + mode are NOT persisted (matches 05a). `currentPage`/`numPages` from WebView messages drive
  the indicator.
- Extract a tiny pure helper if any math lands natively (none expected — most-visible-page logic lives in the
  HTML reader) so the screen stays testable without a WebView.

### `app/reader/[id].tsx` — expo-router route
- Dynamic route: read `id` (+ optional `title`) from `useLocalSearchParams`, render `<ReaderScreen>`.
  `headerShown:false` is already set globally in `_layout.tsx`. Back = `router.back()`.

### `src/library/document-row.tsx` — make rows tappable
- Wrap the row in a `Pressable` (was display-only) that calls `router.push({ pathname:'/reader/[id]',
  params:{ id: doc.id, title: doc.title } })`. Add the pressed state + `accessibilityRole="button"` +
  `accessibilityLabel` (e.g. `Open ${doc.title}`). Keep the existing layout/tokens. Thread no new prop if the
  row navigates directly via `useRouter`; otherwise pass an `onOpen(id)` from the screen (executor's call —
  prefer direct `useRouter` to avoid prop drilling through FlatList `renderItem`).

## Dependencies
- `react-native-webview` — install via `expo install react-native-webview` (Expo SDK 56-aligned; **bundled in
  Expo Go**, so no custom dev client). Confirm `expo install --check` stays clean.
- `pdfjs-dist@6.0.227` — add to `apps/mobile` (matches the architecture pin + web; supplies the WebView's
  pdf.js build files). Pin exact.
- If any new dep ships a postinstall/build script, add it to `allowBuilds` in `pnpm-workspace.yaml` (04d
  carry-forward) or frozen CI install fails.
- No `react-native-pdf` (engine decision above). No router dep beyond the existing expo-router.

## Tests (`apps/mobile/src/tests/`, vitest — headless, no WebView/Expo runtime)
A WebView can't run headless, so assert the **native** seams, not pixels:
- `native-store.test.ts` (extend): `getPdfBytes` returns stored bytes after an import; `undefined` for an
  unknown id; value-isolated (mutating the result doesn't corrupt the store) — mirror the 05a web-store test.
- A pure unit for any extracted helper (bridge message parse/guard, or reader-theme→palette map) if one is
  factored out — keep logic out of the WebView component so it's testable.
- `reader-webview` / `reader-screen` are NOT unit-tested at the render level (need a WebView + Expo runtime);
  they are **device-verified** below. Do not write hollow mocks that assert nothing.
- Keep the existing 25 mobile tests green.

## Verify when done
- [ ] Tapping a Library row navigates to the reader; back returns to the Library with the list intact.
- [ ] The PDF renders inside the WebView; continuous vertical scroll is the default; large PDFs stay
      responsive (lazy render, no upfront render of every page); the indicator tracks the visible page.
- [ ] Paged mode renders one page with working prev/next; indicator shows `X of N`.
- [ ] Text is selectable over a text-bearing PDF; a scanned/image PDF renders pixels with no text layer and
      no error (geometry extraction to RN is 05c — selection inside the WebView is enough here).
- [ ] Reader theme paper/sepia/night switches the WebView page surface independently of app chrome (the app
      light/dark theme is unchanged); a corrupt/missing blob shows a gentle notice, not a crash.
- [ ] UI uses only `@ember/tokens` tokens (invariant #6); row + toolbar controls keep the 02d/04c segmented
      `accessibilityRole`/`accessibilityState.checked` a11y pattern.
- [ ] `architecture.md` updated (mobile PDF row → pdf.js-in-WebView) + the mobile-text-extraction Open
      Question marked resolved.
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes (existing 25 + new) · `pnpm -w lint` clean.
- [ ] `expo export -p android` → "Exported: dist" (headless bundle check, per every prior mobile unit).
- [ ] No architecture invariant violated — esp. #1 (reader works fully offline; bytes from
      ExpoFileSystemBlobStore, Convex never on the read path), #6 (tokens). core/store gain no
      WebView/pdf.js import; text-layer shape NOT promoted to core (that's 05c).
- [ ] **DEVICE-BOUND (user, Expo Go, before merge):** `npx expo start` in apps/mobile → open an imported PDF
      → pages render and scroll; select text; toggle scroll↔paged (prev/next works in paged); switch reader
      theme paper/sepia/night (app chrome unchanged); a multi-hundred-page PDF scrolls without rendering every
      page up front; corrupt/missing blob shows the gentle notice. (The reader is real UI — no throwaway
      dev-harness screen needed, unlike the 03c/04c verifications.)

## Device-bound risks to validate at build (from official docs, not memory — mobile process rule)
- Exact mechanism to ship pdf.js + the HTML reader into the WebView (expo-asset URI vs. inlined `html`+
  `baseUrl`) and the iOS `allowingReadAccessToURL` / Android `allowFileAccess` flags.
- pdf.js worker inside a WebView (whether `pdf.worker.mjs` loads, or run worker-disabled / `disableWorker`).
- Base64 bridge size for large PDFs (acceptable for 05b; file-stream optimization deferred).
