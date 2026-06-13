# Unit 09c: Mobile reader captures pdfjs numPages → setDocumentPageCount

Issue: #78 (part of umbrella Unit 09, #9) · Branch: feat/78-mobile-reader-pagecount
Boundary: apps/mobile (native store surface + reader hook + reader-screen wiring)
Route: **standard** — single boundary (apps/mobile), no product fork, no new dep. The core/store
brain already exists (09a `setDocumentPageCount`); this slice is the device shell that calls it.
Device-bound (the page count originates in the in-WebView pdf.js bridge), but the only headless-
testable seam is the store surface — the hook follows the codebase's Expo-Go-verified precedent.

Phase 1 (page-count capture), **third and final slice** of umbrella **Unit 09 (Stats tab)**:
- **09a** ✅ core `Document.pageCount` + store `setDocumentPageCount` (set-once/idempotent, one HLC
  outbox entry) — MERGED (#74).
- **09b** ✅ web reader captures pdfjs `numPages` and persists it — MERGED (#76, PR #77).
- **09c** (this) mobile reader captures it via the WebView pdf.js bridge (device-bound).
- Phase 2 — analytics: **09d** core stats engine → **09e** web Stats tab → **09f** mobile Stats tab.

This is the mobile twin of 09b. Same three-piece design, mirrored onto the Native store + RN reader.

## Goal
When the Expo/RN reader finishes loading a PDF, persist that document's **total page count** by
calling the 09a store use-case once. After this slice, every document the user has opened on mobile
carries a `pageCount`, so 09d can derive per-book % and finish ETA on either platform. The write is
**fire-and-forget** and **idempotent** (09a guarantees no-op on an unchanged count), so re-opening
the same document is free and never blocks the reader (invariant #1).

## Context (already in place — read these, change only what this spec names)
- `apps/mobile/src/reader/reader-webview.tsx` — the WebView bridge. The in-page pdf.js posts
  `{ type: 'ready'; numPages: number }`; `handleMessage` forwards it via `onReady(msg.numPages)`.
  **`numPages` is already bridged.** No change here.
- `apps/mobile/src/reader/reader-screen.tsx` — `ReaderScreen` holds `status` (`'loading' | 'ready'
  | 'error' | 'missing'`) and `numPages` state. `handleWebViewReady(n)` sets `numPages` + `status`
  `'ready'`. It already composes sibling side-effect hooks (`useReadingPosition`,
  `useSessionTracking`) with a `ready: status === 'ready'` flag. The new hook slots in beside them.
  **`numPages` is already in scope.** No state change needed.
- `apps/mobile/src/store/native-store.ts` — `NativeStore` facade. Each mutation wraps an
  `@ember/store` use-case with clock-injected deps, e.g. `saveReadingPosition` →
  `saveReadingPosition({ repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() }, …)`.
  `Document` is already imported here.
- `@ember/store` `setDocumentPageCount(deps, docId, pageCount)` — the 09a use-case, already
  barrel-exported from `packages/store/src/index.ts` (confirmed during 09b — rides `export * from
  './documents.js'`). No barrel change.
- `apps/mobile/src/reader/use-session-tracking.ts` — the **fire-exactly-once-per-docId** pattern to
  mirror: a `openedForDocRef` guard, stable `storeRef` updated in an effect, error swallowed with a
  `console.warn`, guard reset in cleanup so the next docId re-arms. Note mobile reads the store via
  `const { store } = useNativeStore()` (an object with a `store` member — unlike web's
  `useWebStore()` which returns the store directly).
- `apps/mobile/src/tests/native-store-reading-position.test.ts` — the `makeDeps()` harness to mirror
  for the surface test: `MemoryRepository` + `MemoryBlobStore` + fake `Hasher` + `createNativeClock`
  over an in-memory `makeStorage()`; `createNativeStore({ repo, blobs, hasher, clock })`.

## Design decisions (mechanical — no product invention; mirrors 09b)
- **Capture trigger:** exactly once per docId mount, when `ready && numPages > 0`. Guard with a
  `capturedForDocRef` (mirrors `openedForDocRef`); reset on docId change so switching documents
  re-arms. `numPages > 0` guard avoids writing a bogus 0 before the bridge posts `ready`.
- **Fire-and-forget + swallow errors.** The reader never awaits or surfaces this write (invariant #1:
  works offline; a store error must never break reading). Mirror `useSessionTracking`'s
  `void storeRef.current?.setDocumentPageCount(...).catch((err) => console.warn(...))`. Note the
  optional-chain on `storeRef.current` — mobile's `useNativeStore` can yield a null store before the
  store is composed (the existing session/position hooks all `?.` it), so 09c does the same.
- **Idempotent by construction.** 09a's `setDocumentPageCount` is a no-op when the stored count
  already equals `numPages`, so a re-open writes nothing — no extra guard logic beyond the
  once-per-mount ref.
- **No UI.** Page count is headless metadata consumed later by Stats (09d+); nothing is rendered in
  this slice (the toolbar already shows `currentPage / numPages` from existing state — unchanged). The
  spec-unit "UI unit → frontend-design/impeccable" path does **not** apply.
- **Dedicated hook, not folded into the screen's load effect.** Keep each reader side-effect isolated
  in its own hook (`use-reading-position`, `use-session-tracking`) — `useCapturePageCount` is the
  same idiom. Mirrors the 09b decision exactly.
- **No renderHook unit test.** Mobile has **no headless React test renderer** in this project — the
  existing `use-session-tracking.ts` / `use-reading-position.ts` hooks carry no `.test.tsx` and are
  verified in Expo Go (see their file headers: "the hook's React-integration layer has no headless
  test renderer available in this project"). 09c follows that precedent: the **store surface** is
  unit-tested; the hook's React wiring is verified on device. (This is the one intended divergence
  from 09b, which did have a web renderHook test — driven by the platform's test infra, not scope.)

## Implementation

### 1. `apps/mobile/src/store/native-store.ts` (edit)
- Import the use-case: add `setDocumentPageCount` to the existing `@ember/store` value import
  (the line already importing `importDocument, saveReadingPosition, …`).
- Add to the `NativeStore` interface (mirror the `saveReadingPosition` doc-comment voice):
  ```ts
  /**
   * Persist a document's total page count (set-once / idempotent — see 09a). Writes the updated
   * Document record + exactly one HLC-stamped outbox entry only when the count actually changes;
   * a no-op (no write) when the stored count already matches. Returns the updated record, or null
   * when the document isn't found. Called by the reader (09c) when pdf.js reports numPages.
   */
  setDocumentPageCount(docId: string, pageCount: number): Promise<Document | null>;
  ```
- Add to the factory return object (mirror `saveReadingPosition`'s deps wiring):
  ```ts
  async setDocumentPageCount(docId: string, pageCount: number): Promise<Document | null> {
    return setDocumentPageCount(
      { repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
      docId,
      pageCount,
    );
  }
  ```

### 2. `apps/mobile/src/reader/use-capture-page-count.ts` (new)
A thin hook mirroring `use-session-tracking`'s guard/ref/error-swallow pattern (and 09b's web twin),
adapted to mobile's `useNativeStore()` (which returns `{ store }`, possibly null):
```ts
/**
 * use-capture-page-count.ts — persist a document's total page count once the PDF is loaded.
 *
 * Fire-exactly-once per docId mount: when the reader is ready and numPages is known (from the
 * in-WebView pdf.js bridge), call store.setDocumentPageCount (09a) fire-and-forget. Idempotent at
 * the store layer, so a re-open writes nothing. All errors swallowed (invariant #1: a store failure
 * never breaks reading).
 *
 * Mirrors the web twin (09b apps/web use-capture-page-count.ts) and the local use-session-tracking
 * guard/ref pattern. Device-bound React wiring is verified in Expo Go (no headless renderer here).
 */
import { useEffect, useRef } from 'react';

import { useNativeStore } from '../store/store-context.js';

export interface UseCapturePageCountArgs {
  docId: string;
  /** True once the PDF is loaded and the WebView has posted 'ready'. */
  ready: boolean;
  /** Total pages from the pdf.js bridge; 0 until ready. */
  numPages: number;
}

export function useCapturePageCount({ docId, ready, numPages }: UseCapturePageCountArgs): void {
  const { store } = useNativeStore();
  const storeRef = useRef(store);
  const capturedForDocRef = useRef<string | null>(null);

  useEffect(() => { storeRef.current = store; }, [store]);

  useEffect(() => {
    if (!ready || numPages <= 0) return;
    if (capturedForDocRef.current === docId) return; // already captured this mount
    capturedForDocRef.current = docId;

    void storeRef.current?.setDocumentPageCount(docId, numPages).catch((err: unknown) => {
      console.warn('[useCapturePageCount] setDocumentPageCount error (swallowed):', err);
    });

    return () => { capturedForDocRef.current = null; }; // re-arm for the next docId
  }, [docId, ready, numPages]);
}
```
- **Confirm** `useNativeStore` is exported from `apps/mobile/src/store/store-context.js` and returns a
  `{ store }` shape (the session/position hooks import it the same way — match their import exactly).

### 3. `apps/mobile/src/reader/reader-screen.tsx` (edit)
- Import `useCapturePageCount`.
- Call it inside `ReaderScreen`, beside the existing `useReadingPosition` / `useSessionTracking`:
  ```ts
  useCapturePageCount({ docId, ready: status === 'ready', numPages });
  ```
  (`status` and `numPages` are already component state, set by `handleWebViewReady`.)
- No render/markup change.

### Tests
- `apps/mobile/src/tests/native-store-page-count.test.ts` (new — mirror
  `native-store-reading-position.test.ts`'s `makeDeps()` harness):
  - seed a document first (`store.importPdf(bytes, filename)` with a tiny fixture `Uint8Array`, OR
    `repo.put` a `Document` fixture into the documents collection), then
    `setDocumentPageCount(docId, n)` → returns the updated doc with `pageCount === n`; the stored
    record reflects it; **exactly one** new outbox entry (documents collection, `recordId === docId`,
    `op 'put'`) beyond any import entry.
  - **idempotent** → calling again with the same count adds no further outbox entry (compare
    `repo.unacked()` length before/after).
  - **missing doc** → returns `null`, no document record, no outbox entry.
- **No hook test** — see the design note (mobile has no headless renderer; the hook mirrors the
  Expo-Go-verified session-tracking precedent and is checked on device).

## Dependencies
- none new. The pdf.js bridge (`numPages`) and `@ember/store` `setDocumentPageCount` already exist.
  apps/mobile only.

## Verify when done
- [ ] `reader-webview.tsx` bridge unchanged; `numPages` consumed as-is via `onReady` → screen state.
- [ ] `NativeStore.setDocumentPageCount` delegates to the 09a use-case with clock-injected
      `{ repo, newOutboxId, hlc }` (mirrors `saveReadingPosition`).
- [ ] `useCapturePageCount` fires once per docId on `ready && numPages > 0`, fire-and-forget,
      swallows errors, re-arms on docId change; reads the store via `useNativeStore()` with `?.`.
- [ ] `reader-screen.tsx` wires the hook; no markup/visual change (no UI design pass needed).
- [ ] New surface test green; existing mobile suite unchanged.
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] packages/* , apps/web byte-identical to main (apps/mobile-only diff).
- [ ] Invariants honoured — #1 (offline; store error never breaks the reader; no Convex on the path;
      null-store `?.` guard), #2 (the page-count write goes through the outbox with an HLC stamp —
      provided by 09a, exercised by the surface test), #6 (no hardcoded tokens — N/A, no UI).
