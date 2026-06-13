# Unit 09b: Web reader captures pdfjs numPages → setDocumentPageCount

Issue: #76 (part of umbrella Unit 09, #9) · Branch: feat/76-web-reader-pagecount
Boundary: apps/web (web store surface + reader hook + reader-page wiring)
Route: **standard** — single boundary (apps/web), no product fork, no new dep. The core/store
brain already exists (09a `setDocumentPageCount`); this slice is the platform shell that calls it.

Phase 1 (page-count capture), **second slice** of umbrella **Unit 09 (Stats tab)**:
- **09a** ✅ core `Document.pageCount` + store `setDocumentPageCount` (set-once/idempotent, one HLC
  outbox entry) — MERGED (#74).
- **09b** (this) web reader captures pdfjs `numPages` and persists it.
- **09c** mobile reader captures it via the WebView pdfjs bridge (device-bound).
- Phase 2 — analytics: **09d** core stats engine → **09e** web Stats tab → **09f** mobile Stats tab.

## Goal
When the web reader finishes loading a PDF, persist that document's **total page count** by calling
the 09a store use-case once. After this slice, every document the user has opened in the web app
carries a `pageCount`, so 09d can derive per-book % and finish ETA. The write is **fire-and-forget**
and **idempotent** (09a guarantees no-op on an unchanged count), so re-opening the same document is
free and never blocks the reader.

## Context (already in place — read these, change only what this spec names)
- `apps/web/src/reader/use-pdf-document.ts` — load hook. On success sets
  `{ status: 'ready', pdf, numPages: proxy.numPages }`. **`numPages` is already surfaced** (0 until
  ready). No change needed here.
- `apps/web/src/reader/reader-page.tsx` — `ReaderPage` reads `{ status, pdf, numPages }` from
  `usePdfDocument` and already composes sibling side-effect hooks (`useReadingPosition`,
  `useSessionTracking`) with a `ready: status === 'ready'` flag. The new hook slots in beside them.
- `apps/web/src/store/web-store.ts` — `WebStore` facade. Each mutation wraps an `@ember/store`
  use-case with clock-injected deps, e.g. `saveReadingPosition` →
  `saveReadingPosition({ repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() }, …)`.
  `Document` is already imported here.
- `@ember/store` `setDocumentPageCount(deps, docId, pageCount)` — the 09a use-case. Confirm it is
  barrel-exported from `packages/store/src/index.ts` (09a noted it rides the existing export); if not
  exported, add it to the barrel (consumer surface only).
- `apps/web/src/reader/use-session-tracking.ts` — the **fire-exactly-once-per-docId** pattern to
  mirror: an `openedForDocRef` guard, stable `storeRef`, error swallowed with a `console.warn`,
  guard reset in cleanup so the next docId re-arms.

## Design decisions (mechanical — no product invention)
- **Capture trigger:** exactly once per docId mount, when `ready && numPages > 0`. Guard with a
  `capturedForDocRef` (mirrors `openedForDocRef`); reset on docId change so switching documents
  re-arms. `numPages > 0` guard avoids writing a bogus 0 before load completes.
- **Fire-and-forget + swallow errors.** The reader never awaits or surfaces this write (invariant #1:
  works offline; a store error must never break reading). Mirror `useSessionTracking`'s
  `void store.…().catch((err) => console.warn(...))`.
- **Idempotent by construction.** 09a's `setDocumentPageCount` is a no-op when the stored count
  already equals `numPages`, so a re-open writes nothing — no extra guard logic needed beyond the
  once-per-mount ref (which just avoids a redundant async call within a single mount).
- **No UI.** Page count is headless metadata consumed later by Stats (09d+); nothing is rendered in
  this slice. (So the spec-unit "UI unit → frontend-design/impeccable" path does **not** apply.)
- **Dedicated hook, not folded into `usePdfDocument`.** Keep the read hook (load lifecycle) free of
  writes — the codebase consistently isolates each reader side-effect in its own hook
  (`use-reading-position`, `use-session-tracking`). `useCapturePageCount` is the same idiom and is
  independently render-hook-testable.

## Implementation

### 1. `apps/web/src/store/web-store.ts` (edit)
- Import the use-case: add `setDocumentPageCount` to the existing `@ember/store` value import
  (the line already importing `importDocument, saveReadingPosition, …`).
- Add to the `WebStore` interface:
  ```ts
  /** Persist a document's total page count (set-once / idempotent — see 09a). Returns the
   *  updated record, or null when the document isn't found. */
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

### 2. `apps/web/src/reader/use-capture-page-count.ts` (new)
A thin hook mirroring `use-session-tracking`'s guard/ref/error-swallow pattern:
```ts
/**
 * use-capture-page-count.ts — persist a document's total page count once the PDF is loaded.
 *
 * Fire-exactly-once per docId mount: when the reader is ready and numPages is known, call
 * store.setDocumentPageCount (09a) fire-and-forget. Idempotent at the store layer, so a re-open
 * writes nothing. All errors swallowed (invariant #1: a store failure never breaks reading).
 */
import { useEffect, useRef } from 'react';

import { useWebStore } from '../store/store-context.js';

export interface UseCapturePageCountArgs {
  docId: string;
  /** True once the PDF is loaded (status === 'ready'). */
  ready: boolean;
  /** Total pages from pdfjs; 0 until ready. */
  numPages: number;
}

export function useCapturePageCount({ docId, ready, numPages }: UseCapturePageCountArgs): void {
  const store = useWebStore();
  const storeRef = useRef(store);
  const capturedForDocRef = useRef<string | null>(null);

  useEffect(() => { storeRef.current = store; }, [store]);

  useEffect(() => {
    if (!ready || numPages <= 0) return;
    if (capturedForDocRef.current === docId) return; // already captured this mount
    capturedForDocRef.current = docId;

    void storeRef.current.setDocumentPageCount(docId, numPages).catch((err: unknown) => {
      console.warn('[useCapturePageCount] setDocumentPageCount error (swallowed):', err);
    });

    return () => { capturedForDocRef.current = null; }; // re-arm for the next docId
  }, [docId, ready, numPages]);
}
```

### 3. `apps/web/src/reader/reader-page.tsx` (edit)
- Import `useCapturePageCount`.
- Call it inside `ReaderPage`, beside the existing hooks:
  ```ts
  useCapturePageCount({ docId, ready: status === 'ready', numPages });
  ```
  (`status` and `numPages` are already destructured from `usePdfDocument` at the top of `ReaderPage`.)
- No render/markup change.

### Tests
- `apps/web/src/tests/web-store-page-count.test.ts` (new — mirror
  `web-store-reading-position.test.ts`'s `makeWebStore()` harness: `MemoryRepository` +
  `MemoryBlobStore` + `subtleCryptoHasher` + `createWebClock` over `makeStorage()`):
  - seed a document first (`store.importPdf(...)` with a small fixture `File`, OR `repo.put` a
    `Document` fixture into `DOCUMENTS_COLLECTION`), then `setDocumentPageCount(docId, n)` →
    returns the updated doc with `pageCount === n`; the document record reflects it; **exactly one**
    new outbox entry (`collection` documents, `recordId === docId`, `op 'put'`) beyond any import
    entry.
  - **idempotent** → calling again with the same count adds no further outbox entry.
  - **missing doc** → returns `null`, no document record, no outbox entry.
- `apps/web/src/tests/use-capture-page-count.test.tsx` (new — `renderHook` from
  `@testing-library/react` wrapped in a `StoreProvider` with an injected fake `WebStore` exposing a
  `vi.fn()` `setDocumentPageCount`; mirror `use-session-tracking.test.tsx`'s injected-store setup):
  - fires `setDocumentPageCount(docId, numPages)` **once** when `ready` and `numPages > 0`.
  - does **not** fire when `!ready`, nor when `numPages === 0`.
  - does **not** re-fire on re-render with unchanged props.
  - re-fires for a **new** docId (rerender with a different docId).
  - a rejected `setDocumentPageCount` is swallowed (no throw out of the hook; `console.warn` spy
    asserted, optional).

## Dependencies
- none new. pdfjs (`numPages`) and `@ember/store` `setDocumentPageCount` already exist. apps/web only.

## Verify when done
- [ ] `usePdfDocument` unchanged; `numPages` consumed as-is.
- [ ] `WebStore.setDocumentPageCount` delegates to the 09a use-case with clock-injected
      `{ repo, newOutboxId, hlc }` (mirrors `saveReadingPosition`).
- [ ] `useCapturePageCount` fires once per docId on `ready && numPages > 0`, fire-and-forget,
      swallows errors, re-arms on docId change.
- [ ] `reader-page.tsx` wires the hook; no markup/visual change (no UI design pass needed).
- [ ] New surface + hook tests green; existing web suite unchanged.
- [ ] `pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint` all clean.
- [ ] packages/* , apps/mobile byte-identical to main (apps/web-only diff).
- [ ] Invariants honoured — #1 (offline; store error never breaks the reader; no Convex on the path),
      #2 (the page-count write goes through the outbox with an HLC stamp — provided by 09a, exercised
      here), #6 (no hardcoded tokens — N/A, no UI).
