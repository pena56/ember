# Unit 06d: mobile reader capture/restore — resume reading position

Issue: #58 (part of umbrella Unit 06, #6) · Branch: feat/58-mobile-reader-capture-restore · Boundary: apps/mobile
Route: standard — wires 06a's store layer into the existing mobile WebView reader; single boundary, no new dep,
behavioral (no net-new visual surface → frontend-design does not apply). Device-bound (WebView scroll mechanics).

Mobile counterpart of **06b** (web reader capture/restore, #54, MERGED). Umbrella Unit 06 split COMPLEX→sub-units:
**06a** core+store brain (#52 ✓) → **06b** web capture/restore (#54 ✓) → **06c** web Today tab + router (#56 ✓) →
**06d** mobile capture/restore (this) → **06e** mobile native Today + tab nav (deferred — net-new UI, device-bound).
The umbrella "06d mobile reader resume + native Today" scored COMPLEX (two visible results) → split by result exactly
like the web 06b/06c split; this slice is the reader wiring only.

## Goal
The mobile reader **resumes where you left off**: opening a document scrolls the WebView to the last saved page +
within-page offset; while reading, the position is captured (last-write, debounced) to the 06a store — one
`ReadingPosition` record + one HLC-stamped outbox entry per save. No Today screen, no tab nav, no merge wiring
(furthest-page `mergeReadingPosition` stays unused until the unit-12 reconciler).

## Contract (inherited from 06a/06b — do not re-decide)
- **Local save = last-write** (literal current position, can move backward → resume-where-you-left-off). Furthest-page
  `mergeReadingPosition` runs only at cross-device reconcile (unit 12) — untouched here.
- **`page`** 1-based; **`offset`** within-page `0..1` (top→bottom), so it maps across viewports. Scroll mode captures a
  real fraction; paged mode = 0 (whole page in view, resume to page top).
- **Throttling is a UI concern:** debounce ≈600 ms; resume once per docId after the reader is ready. 06a's store
  contract is one record + one outbox entry per `saveReadingPosition` call.

## Implementation

### `apps/mobile/src/store/native-store.ts` (extend) — mirror 06b's web-store, and the existing `getPdfBytes` shape
Add to the `NativeStore` interface + `createNativeStore` factory (caller supplies nothing; the factory injects
`clock`/`repo`):
- `saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition>`
  → `saveReadingPosition({ repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() }, input)`
  (imported from `@ember/store`). Last-write upsert + one outbox entry — all enforced in 06a; do not re-implement.
- `getReadingPosition(docId: string): Promise<ReadingPosition | undefined>`
  → `getReadingPosition(repo, docId)` (from `@ember/store`).
- Do **not** expose `listReadingPositions` here — 06e's native Today needs it, not 06d (YAGNI; add it then, exactly as
  06b deferred it to 06c). `ReadingPosition` type from `@ember/core`.

### `apps/mobile/src/reader/reading-position-controller.ts` (new — pure, no React, no RN, injectable timers)
The mobile WebView can't render in jsdom, and the app has **no React test renderer** (all current mobile tests are
pure `.ts`). So the resume-once + debounce-save coordination lives in a pure, headlessly-testable controller (mirrors
the `native-clock` / `coerceStoredPreference` house style — logic pure, deps injected), with a thin React hook wrapper
(below) that is device-verified, not unit-tested.

`export function createReadingPositionController(deps): ReadingPositionController` where `deps`:
- `getPosition: (docId: string) => Promise<ReadingPosition | undefined>`
- `savePosition: (input: { docId: string; page: number; offset: number }) => Promise<ReadingPosition>`
- `getCurrent: () => { page: number; offset: number }`  — latest position reported by the WebView
- `onResume: (saved: ReadingPosition) => void`           — tell the WebView to go to the saved spot
- `debounceMs?: number` (default 600)
- `setTimer?` / `clearTimer?` (default `setTimeout`/`clearTimeout`) — injected so tests use fake timers without a clock dep

`ReadingPositionController` methods:
- `resume(docId: string): void` — **idempotent per docId**: on first call for a given docId, `await getPosition(docId)`;
  if found, call `onResume(saved)`. A subsequent `resume(samedocId)` is a no-op; `resume(otherDocId)` re-arms. Guard with
  a "resumed docId" field + a generation token so a stale in-flight `getPosition` for an old docId never calls `onResume`.
- `scheduleSave(docId: string): void` — (re)start the debounce timer; on fire, read `getCurrent()` and
  `await savePosition({ docId, ...current })`. Swallow/log save errors — a failed save must never break reading
  (invariant #1).
- `flush(docId: string): void` — if a save is pending, cancel the timer and save immediately (used on unmount / before a
  docId change so one doc's position is never written under another's id).
- `dispose(): void` — clear any pending timer (no save).

### `apps/mobile/src/reader/use-reading-position.ts` (new — thin React hook over the controller)
`useReadingPosition(args: { docId: string; ready: boolean; getCurrent: () => { page: number; offset: number }; onResume: (saved: ReadingPosition) => void }): { scheduleSave: () => void }`
- Store from `useNativeStore()`. Build the controller once (ref), wiring `getPosition`/`savePosition` to the store and
  `getCurrent`/`onResume` from args (keep the latest in a ref so the controller always sees current closures).
- When `ready` flips true → `controller.resume(docId)`.
- On `docId` change and on unmount → `controller.flush(prevDocId)` then re-arm (resume fires again when `ready` for the new
  docId). Never resume before `ready` (pages aren't measurable yet).
- `scheduleSave` delegates to `controller.scheduleSave(docId)`.

### `apps/mobile/src/reader/build-reader-html.ts` (extend the WebView bridge)
The within-page offset math runs **inside the WebView** (it owns `window.scrollY` + page element rects), not in RN.
- **Capture (WebView → RN): add `{ type: 'position', page, offset }`.**
  - Scroll mode: on scroll-settle (rAF- or ~150 ms-debounced `scroll` listener on `window`), compute the topmost visible
    page `p` and `offset = clamp((window.scrollY - pageEl.offsetTop) / pageEl.offsetHeight, 0, 1)` (guard
    `offsetHeight <= 0 → 0`), and post `{ type:'position', page:p, offset }`.
  - Paged mode: on prev/next nav, post `{ type:'position', page: currentPage, offset: 0 }`.
  - Keep the existing `{ type:'page', current }` message for the toolbar indicator (don't break 05b's tests/behavior);
    `position` is the capture signal, `page` is the indicator signal.
- **Restore (RN → WebView): extend `gotoPage` to `{ type:'gotoPage', page, offset? }`.**
  - Scroll mode: set the scroll position to `pageEl.offsetTop + clamp(offset,0,1) * pageEl.offsetHeight` (e.g.
    `window.scrollTo`) instead of `scrollIntoView` to the top, so the saved fraction lands at the top of the viewport.
    Placeholders carry estimated heights immediately after `applyMode`, so this works before the page bitmap renders
    (offset is approximate until rendered — acceptable; device-verify confirms).
  - Paged mode: `offset` ignored (go to the page; whole page in view) — current behavior.
- Update the bridge-message doc comment at the top of the file to list `position` and the `gotoPage` offset.

### `apps/mobile/src/reader/reader-webview.tsx` (wire the bridge)
- Add to `WebViewInMessage`: `| { type: 'position'; page: number; offset: number }`.
- Add prop `onPosition?: (page: number, offset: number) => void`; in `handleMessage`, route `position` → `onPosition`.
- Add a **one-shot resume command prop** (declarative, matching the existing load/mode/theme effect pattern — the
  component exposes no imperative ref API): `resumeTo?: { page: number; offset: number } | undefined`. An effect posts
  `{ type:'gotoPage', page, offset }` when `resumeTo` changes (gated on `bootReadyRef`, like the other posts). The screen
  sets `resumeTo` exactly once per docId from `onResume`.

### `apps/mobile/src/reader/reader-screen.tsx` (wire)
- Keep a `latestPosRef = useRef({ page: 1, offset: 0 })`; update it from `onPosition` (the WebView's capture signal).
  Leave `onPageChange`→`setCurrentPage` as-is (toolbar indicator).
- `const { scheduleSave } = useReadingPosition({ docId, ready: status === 'ready', getCurrent: () => latestPosRef.current, onResume })`.
  - `onResume(saved)` → `setCurrentPage(saved.page)` and set `resumeTo` state to `{ page: saved.page, offset: saved.offset }`
    (passed to `<ReaderWebView resumeTo=… />`).
- Call `scheduleSave()` from `onPosition` (the hook debounces a burst of scroll/nav positions into one save).
- Reset `latestPosRef`/`resumeTo` on `docId` change (mirrors the existing load-effect reset).
- Keep all existing reader behavior (modes, themes, virtualization, text layer, hang watchdog, geometry) untouched.

### Tests (headless — Vitest, no device, no React renderer)
- `apps/mobile/src/tests/native-store-reading-position.test.ts` (MemoryRepository + MemoryBlobStore + fake Hasher +
  injected clock, mirroring `native-store.test.ts`): `saveReadingPosition` writes exactly one record + exactly one
  HLC-stamped outbox entry (`recordId === docId`, `op:'put'`); `getReadingPosition` reads it back; **last-write, not
  furthest** — save page 50 then page 10 → `getReadingPosition` returns page 10 (one record, two outbox entries);
  unknown id → `undefined`. (Thin wrapper over already-tested 06a — assert the seam, not 06a internals.)
- `apps/mobile/src/tests/reading-position-controller.test.ts` (pure, injected fake timers + spy deps):
  `resume(docId)` fires `onResume` once with the stored position and is idempotent for the same docId; a stale
  `getPosition` resolving after a docId change does **not** call `onResume`; `resume` with no stored position does
  nothing and never throws; `scheduleSave` debounces a burst into a single `savePosition({docId, ...getCurrent()})` after
  `debounceMs`; `flush` saves immediately and cancels the pending timer; a rejecting `savePosition` is swallowed (no
  throw). Pixel-accurate scroll restore is **device-verified** (offset math lives in the WebView; jsdom has no layout).

## Dependencies
- none. `@ember/core` / `@ember/store` already provide the reading-position layer (06a); react-native-webview + pdfjs are
  already mobile deps (05b). No new native module → stays in Expo Go.

## Verify when done
- [ ] Opening a document resumes to the saved page + within-page offset (scroll mode); paged mode resumes the page.
- [ ] Reading captures position as last-write (debounced) — one `ReadingPosition` record + one HLC-stamped outbox entry
      per save; re-saving a lower page replaces the stored record (06a contract, exercised here).
- [ ] A doc with no saved position opens at page 1; a failed save/read never breaks reading (invariant #1).
- [ ] `mergeReadingPosition` remains unused (no merge on the local save/read path — reconcile is unit 12; #5).
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all green.
- [ ] `cd apps/mobile && npx expo export -p android` → "Exported: dist" (the 05b/05c WebView bundle gate; run
      `bundle-pdfjs` / `typecheck` first so the generated `pdf-js-content.ts` exists in a fresh clone).
- [ ] No invariant violated — esp. #1 (works offline, Convex never on read path), #2 (every save through the outbox with
      an HLC stamp). packages/core + packages/store + apps/web stay **byte-identical** (apps/mobile-only change).

## Routing note
Standard route: TDD executor (Sonnet, test-first on the native-store seam + the pure controller) → fresh-context Opus
review against architecture.md invariants. **No frontend-design / impeccable** — this is behavioral wiring on the
existing reader chrome with no net-new visual surface and no token changes (run `impeccable` only if a visible "resumed
to page N" affordance is added; it would then need to be token-driven per ui-context.md).

**DEVICE-BOUND (user, before merge — Expo Go, like 05b; no throwaway dev harness needed, the behavior is visible in the
real reader):** open a multi-page PDF → scroll to mid-document → back to Library → reopen → resumes to the same
page + within-page offset; switch to paged, turn several pages, back, reopen → resumes that page; reopen a never-read doc
→ opens at page 1; force-quit and relaunch after reading → still resumes (real on-disk SQLite persistence via 03c/06a).
Watch for: a dropped resume (gotoPage racing the WebView before pages are laid out — the `bootReady`/`ready` gating
should prevent it; report the last stage if it hangs).
