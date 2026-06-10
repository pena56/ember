# Unit 05c-3: Mobile WebView text-geometry extraction + RN bridge (apps/mobile)

Issue: #50 (part of umbrella #5) · Branch: feat/50-mobile-text-geometry · Boundary: apps/mobile
Route: **standard** — single boundary (apps/mobile); no new dep (pdfjs-dist 6.0.227 + react-native-webview
already mobile deps from 05b; `@ember/core` already a workspace dep); net-new logic is contained (a bridge
message + a pure RN adapter that reuses core's normalizer); ambiguity resolved with the design below. Not a
UI unit — the geometry surfaces through an optional callback with no consumer yet (unit 10's seam), so no
new visible UI, no frontend-design/impeccable pass.

## Where this sits in the 05c chain
- **05c-1 (#46, MERGED):** promoted the shared shape + pure `normalizePageText(pageNumber, viewport, rawItems)`
  to `@ember/core` (`text-geometry.ts`). Coordinate model: normalized 0..1 of the page, top-left origin, y-down.
- **05c-2 (#48, MERGED):** apps/web produces that shape from real pdf.js and committed the **golden parity
  fixture** — `apps/web/test-fixtures/{sample.pdf, raw-textcontent.json, expected-geometry.json}`.
- **05c-3 (this):** the mobile WebView reader extracts the same geometry and RN reproduces the web golden
  **byte-for-byte** through the SAME core normalizer. That cross-client identity is the highlight-anchor
  parity (unit 10) payoff — the literal goal of the resolved mobile-text-extraction open question.

## Design decisions (2026-06-10) — how parity is guaranteed
The parity property only holds if web and mobile funnel identical pdf.js output through the **identical core
function**. That dictates the split:

- **The WebView projects; RN normalizes via `@ember/core`.** The WebView already calls `page.getTextContent()`
  and `page.getViewport({scale:1})` per page for its text layer. It posts that **raw** output across the bridge
  (`{ pageNumber, viewport:{width,height}, items }`); RN runs the filter + projection + `normalizePageText`.
  The normalizer therefore runs in RN over real `@ember/core` — **headlessly testable**, and parity is by
  construction (same function as web). The WebView never imports `@ember/core` (it is an inlined HTML string;
  it cannot). (Rejected: normalizing inside the WebView — would duplicate core's math as untestable inlined JS
  and break the "one function" parity guarantee.)
- **Bridge message shape == the web golden's `raw-textcontent.json` shape, by design.** 05c-2's
  `capture-geometry.mjs` wrote `{ pageNumber, viewport:{width,height}, items: tc.items }`. The WebView posts
  exactly that. So the mobile parity test can feed the **committed web `raw-textcontent.json`** into the RN
  adapter and assert the result equals the committed `expected-geometry.json` — no WebView, no device, no copy
  of the golden (single source of truth: apps/web's committed fixtures).
- **Surface via an optional callback now; no live consumer.** `ReaderWebView` gains
  `onTextGeometry?: (geometry: PageTextGeometry) => void`, fired once per page as that page renders (mirrors the
  lazy text-layer cadence and 05c-2's `pdf-page.tsx onTextGeometry` seam). Do **not** thread it through
  `ReaderScreen` to a consumer — that is unit 10. `ReaderScreen` stays untouched.
- **Geometry extraction failure must never break rendering** (same rule as the text layer): keep it inside the
  existing `try` that already swallows text-layer errors.

## Implementation
All under `apps/mobile/`. Two real-code touch points (WebView HTML + RN wrapper) + one pure RN adapter + tests,
plus a throwaway device-verification screen (deleted in this PR once green — 03c/04c convention).

### 1. `src/reader/build-reader-html.ts` — post raw geometry from the WebView (EDIT)
In `renderPage`, inside the existing text-layer `try` block, **after** `const textContent = await
page.getTextContent();` and **before** the `if (textContent.items.length > 0)` text-layer guard (so it fires
even for text-empty pages), post the raw geometry using the scale-1 viewport already computed as `naturalVp`:
```js
postToRN({
  type: 'geometry',
  pageNumber: pageNum,
  viewport: { width: naturalVp.width, height: naturalVp.height },
  items: textContent.items,
});
```
- `naturalVp = page.getViewport({ scale: 1 })` already exists at the top of `renderPage` — reuse it (the
  normalizer's contract is the **scale-1** viewport in PDF points; do NOT send the scaled render viewport).
- `textContent.items` serializes verbatim (`str`, `width`, `height`, `transform`, `hasEOL`, and any
  `TextMarkedContent` `{type,id}` markers) — RN filters markers, so send them through untouched.
- Reuses the EXISTING `getTextContent()` call — no extra pdf.js work, no second render path.
- Reminder (05b carry-forward): code inside this HTML template literal must avoid backticks and `${` (they
  close the template). Keep the added lines plain.
- Update the bridge-message doc comment at the top of the file to list `{ type:'geometry', … }` in the
  WebView→RN direction.

### 2. `src/reader/page-geometry.ts` — pure RN adapter (NEW)
The mobile twin of apps/web's `page-geometry.ts`, but it consumes **bridged JSON** (untyped) rather than a live
pdf.js `TextContent`, so it validates as it projects. No pdf.js import, no DOM — pure, headlessly testable.
```ts
import { normalizePageText, type PageTextGeometry, type RawTextItem } from '@ember/core';
```
- Type the bridge payload locally (do not depend on pdf.js types here):
  ```ts
  export type RawGeometryMessage = {
    pageNumber: number;
    viewport: { width: number; height: number };
    items: unknown[];
  };
  ```
- **Discriminate TextItem vs TextMarkedContent.** A real text run has a `transform`; a `TextMarkedContent`
  marker (`{type,id?}`) does not. Drop markers; keep every remaining item in order (incl. empty-`str`/`hasEOL`
  spacing items — 05c-1 faithfulness contract). Type guard, e.g.
  `(it): it is { str:string; width:number; height:number; transform:number[] } => !!it && typeof it === 'object' && 'transform' in it`.
- `toRawTextItems(items: unknown[]): RawTextItem[]` — project each kept item to
  `{ str, width, height, transform: it.transform as [number,number,number,number,number,number] }`
  (pdf.js `transform` is always length-6).
- Public entry — pure given its input, mirrors web's `extractPageGeometry` signature but takes the parsed
  bridge message:
  ```ts
  export function geometryFromBridge(msg: RawGeometryMessage): PageTextGeometry {
    return normalizePageText(msg.pageNumber, msg.viewport, toRawTextItems(msg.items));
  }
  ```

### 3. `src/reader/reader-webview.tsx` — parse + forward (EDIT)
- Add `{ type: 'geometry'; pageNumber: number; viewport: { width: number; height: number }; items: unknown[] }`
  to the `WebViewInMessage` union.
- Add `onTextGeometry?: (geometry: PageTextGeometry) => void;` to `ReaderWebViewProps` (import the type from
  `@ember/core`). Destructure it.
- In `handleMessage`, add a `case 'geometry':` that calls
  `onTextGeometry?.(geometryFromBridge(msg))` (import `geometryFromBridge` from `./page-geometry.js`). It is a
  no-op when the prop is unset. Wrap the call so a malformed message can't crash the message handler (the
  existing `JSON.parse` try/catch covers parse; guard the adapter call too).
- Do not touch the boot-handshake / load / mode / theme logic.

### 4. `src/reader/reader-screen.tsx` — UNCHANGED
No consumer of geometry until unit 10. The seam lives on `ReaderWebView`. Leave `ReaderScreen` alone.

### 5. Throwaway device-verification screen (03c/04c convention — DELETE in this PR once green)
The extraction runs in the WebView, so the only true proof is on-device. Geometry has no visible UI, so add a
temporary dev screen that closes the parity loop end-to-end on the device, then delete it in the same PR.
- `app/dev/text-geometry-05c3.tsx` — renders a `ReaderWebView` fed the bytes of the **committed web
  `apps/web/test-fixtures/sample.pdf`** (import the file's bytes; it is the exact golden source). Capture the
  page-1 `onTextGeometry` payload; compare it to the committed `apps/web/test-fixtures/expected-geometry.json`
  via deep equality. Show **PASS/FAIL**, the item count, and the first item's `str` + normalized box.
- Add a `__DEV__` link to it from `app/dev/index.tsx` (the existing dev index) — reuse the dev screen pattern
  established in 03c (`src/dev/verification-harness.tsx` style; an interactive screen, not console logs).
- **Delete `app/dev/text-geometry-05c3.tsx` + its link in this same PR once the user confirms PASS on device**
  (the real adapter + WebView edits stay; only the harness is throwaway).

## Dependencies
- none new. `pdfjs-dist@6.0.227` + `react-native-webview@13.16.1` already in apps/mobile (05b); `@ember/core`
  already a workspace dep (provides `normalizePageText` + `PageTextGeometry`/`RawTextItem`).

## Tests (`apps/mobile/src/tests/`, vitest — headless, no WebView/Expo runtime)
The WebView can't run headless, so test the **RN seams**; the device screen (above) proves the WebView half.
- **Byte-for-byte golden parity (the contract):** read the committed web golden
  `apps/web/test-fixtures/raw-textcontent.json` (resolve a relative path from the test; it is the single source
  of truth — do NOT copy it into apps/mobile), pass it to `geometryFromBridge`, and assert the result
  `toEqual` the committed `apps/web/test-fixtures/expected-geometry.json`. Green = the mobile normalization path
  reproduces the web golden exactly, by construction (same `@ember/core` function).
- **TextMarkedContent is filtered:** feed a synthetic message whose `items` include a `{type:'beginMarkedContent'}`
  marker between two real items; assert the marker is dropped, output count == number of real items, indices
  contiguous `0..n-1`, order + `str` preserved.
- **Faithful preservation:** an empty-`str`/`hasEOL` item is kept (not dropped) and keeps its reading-order index.
- **Wiring:** unit-test that `reader-webview`'s message handler maps a `geometry` bridge message → `onTextGeometry`
  with the right `PageTextGeometry` (right `pageNumber`, item `str`, normalized box). Reuse 05b's existing
  mobile-test mock pattern for `react-native-webview`; if a render-level mount is impractical, exercise the
  pure message→geometry path (`geometryFromBridge`) and keep the handler trivial so it needs no hollow mock.
- Keep the existing 34 mobile tests green.

## Verify when done
- [ ] `geometryFromBridge` reproduces the committed web `expected-geometry.json` byte-for-byte from the
      committed `raw-textcontent.json` (the parity contract); drops `TextMarkedContent`; preserves all
      `TextItem`s (incl. empty/`hasEOL`) in contiguous reading order.
- [ ] The WebView posts `{ type:'geometry', pageNumber, viewport(scale-1), items }` per page from the existing
      `getTextContent()` path; `ReaderWebView` forwards it via `onTextGeometry`; rendering is unaffected when the
      prop is unset and never breaks if extraction throws.
- [ ] `ReaderScreen` unchanged; no live consumer added (unit-10 seam only).
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes (existing 34 mobile + web + new) · `pnpm -w lint` clean.
- [ ] `expo export -p android` → "Exported: dist" (headless bundle check — note: run `bundle-pdfjs` first; the
      05b CI carry-forward — `expo export` does not run `predev`).
- [ ] No architecture invariant violated — esp. **core stays untouched & pure** (no pdf.js/WebView import
      reaches `packages/core`; the adapter imports `@ember/core` type+fn only), #1 (offline; bytes from the
      store, never the network), #6 (no UI/token change this unit).
- [ ] **DEVICE-BOUND (user, Expo Go, before merge):** open `app/dev/text-geometry-05c3.tsx` via the `__DEV__`
      dev index → it loads the committed `sample.pdf` in a real WebView, extracts page-1 geometry on device, and
      diffs it against the committed `expected-geometry.json` → must show **PASS** (item count + first box shown).
      This is the real end-to-end proof that the mobile pipeline reproduces the web golden on a device.
- [ ] After PASS confirmed: the throwaway dev screen + its dev-index link are **deleted in this PR**; only the
      `page-geometry.ts` adapter + `reader-webview.tsx`/`build-reader-html.ts` edits remain.
