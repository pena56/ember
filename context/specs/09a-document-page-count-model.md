# Unit 09a: Document page-count model + store setter

Issue: #74 (part of umbrella Unit 09, #9) · Branch: feat/74-document-page-count-model
Boundary: packages/core + packages/store
Route: **standard** — shared pure-TS brain (core model + store use-case), no new dep, no UI,
ambiguity resolved. Mirrors the 04a/06a/07a/08a shared-brain slice precedent (core type + pure
helper + a thin store use-case writing one HLC-stamped outbox entry).

First slice of umbrella **Unit 09 (Stats tab)**, which scored COMPLEX → split by boundary. **User
decision (2026-06-13):** capture **page count first** so the page-count-dependent stats (per-book %,
finish ETA) become derivable, rather than deferring them. Decomposition (two sub-phases):
- **Phase 1 — page-count capture (prerequisite):** **09a** core `Document.pageCount` + store
  `setDocumentPageCount` (this) → **09b** web reader captures pdfjs `numPages` → **09c** mobile
  reader captures it via the WebView pdfjs bridge (device-bound).
- **Phase 2 — analytics:** **09d** core stats engine → **09e** web Stats tab → **09f** mobile Stats tab.

09a is fully headless-testable: no UI, no clock injection beyond the existing `Hlc` the store
already takes, no DOM, no new dependency.

## Goal
Let a document carry its **total page count** so downstream Stats (per-book %, finish ETA — 09d+) and
the reader can reason about progress. A PDF's page count is **intrinsic to its bytes** (and document
identity is the SHA-256 of those bytes), so `pageCount` is a *pure function of the document*: the same
docId always yields the same count on every device. That makes the write **set-once / idempotent** and
**collision-free across devices** — no last-write-wins tiebreak is needed.

This slice adds:
1. an **optional** `pageCount` field on the core `Document` type (backward-compatible — documents
   imported before this unit simply have it `undefined` until a reader fills it in);
2. a pure core helper `withDocumentPageCount(doc, pageCount)` that validates + returns an updated copy;
3. a store use-case `setDocumentPageCount(deps, docId, pageCount)` that loads the document, applies the
   helper, and — only when the value actually changes — persists the updated record + exactly one
   HLC-stamped outbox entry (invariant #2). The reader (09b/09c) calls this once when pdfjs reports
   `numPages` for an open document.

## Design decisions (defaults — mechanical, no product invention)
- **`pageCount` is optional** (`pageCount?: number`). Existing docs and `makeDocument` are unchanged;
  the field is absent until a reader sets it. This keeps `importDocument` + every existing Document
  test byte-behaviour identical.
- **Validation:** a page count is an **integer ≥ 1**. `withDocumentPageCount` throws `RangeError` on a
  non-finite / non-integer / `< 1` value — passing a bad count is a caller bug (the reader supplies
  pdfjs's real `numPages`, always a positive integer). This is the pure-helper's single guard.
- **Set-once / idempotent:** if the document already has `pageCount === count`, `setDocumentPageCount`
  is a **no-op** (no `put`, no outbox entry) and returns the existing record. Because the count is
  intrinsic, two devices discovering the same PDF write the **identical** value → value-identical
  outbox `put`s → no real conflict. (If a doc somehow had a *different* stored count, the new value
  overwrites it — but that case shouldn't arise for a fixed byte-identity; noted, not specially merged.)
- **Missing document → graceful no-op.** If `repo.get` returns null (doc not imported), the setter
  returns `null` and writes nothing (invariant #1 friendliness — a reader race never throws here).
- **No `updatedAt`/HLC field added to `Document`.** Document records carry no HLC `updatedAt` today
  (they're import-once). Since `pageCount` is intrinsic and collision-free, this slice introduces **no
  new conflict semantics** and needs no LWW tiebreak. **Note for unit 12 (reconciler):** Document is
  the one record type whose updates are value-deterministic from its id, so the generic merge can treat
  duplicate `documents` `put`s as idempotent. (Do not widen this unit to add `updatedAt`.)
- The store write is an outbox `op: 'put'` replaying the **full** updated `Document` (same shape
  `importDocument` already enqueues), so the reconciler/replay path is unchanged.

## Implementation

### `packages/core/src/document.ts` (edit)
- Extend the `Document` type with an optional field:
  ```ts
  /** total number of pages, set once a reader has loaded the PDF (pdfjs numPages). Intrinsic to the
   *  bytes → same docId yields the same count on every device. Absent until a reader fills it in. */
  pageCount?: number;
  ```
  Place it after `importedAt`. `makeDocument` is **unchanged** (never sets `pageCount`).
- Add a pure helper:
  ```ts
  /**
   * Return a copy of `doc` with `pageCount` set. Validates: pageCount must be an integer >= 1
   * (RangeError otherwise). Pure — never mutates the input. Idempotent in value: setting the same
   * count yields an equal record.
   */
  export function withDocumentPageCount(doc: Document, pageCount: number): Document {
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new RangeError(`pageCount must be an integer >= 1, got ${pageCount}`);
    }
    return { ...doc, pageCount };
  }
  ```
- Already barrel-exported via `export * from './document.js'` in `packages/core/src/index.ts` — no
  index change needed (the new symbol rides the existing star export). Core stays runtime-dep-free.

### `packages/store/src/documents.ts` (edit)
Add the use-case next to `importDocument` / `listDocuments` (reuses the file's existing imports —
`Document`, `makeOutboxEntry`, `Repository`, `DOCUMENTS_COLLECTION`; add `withDocumentPageCount` and
`Hlc` to the `@ember/core` import):
```ts
/**
 * Set a document's total page count (write-once / idempotent).
 *
 * - Document not found            → return null, no write.
 * - Same count already stored      → return existing record, no write, no outbox entry.
 * - Otherwise                      → put updated record + exactly one HLC-stamped outbox entry.
 *
 * pageCount is intrinsic to the bytes (docId = sha256), so cross-device writes are value-identical;
 * no LWW tiebreak needed. Called by the reader (09b/09c) when pdfjs reports numPages.
 */
export async function setDocumentPageCount(
  deps: { repo: Repository; newOutboxId: () => string; hlc: Hlc },
  docId: string,
  pageCount: number,
): Promise<Document | null> {
  const existing = await deps.repo.get<Document>(DOCUMENTS_COLLECTION, docId);
  if (!existing) return null;
  if (existing.pageCount === pageCount) return existing; // idempotent no-op

  const updated = withDocumentPageCount(existing, pageCount);
  await deps.repo.put(DOCUMENTS_COLLECTION, updated);
  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: DOCUMENTS_COLLECTION,
      recordId: docId,
      op: 'put',
      payload: updated,
    }),
  );
  return updated;
}
```
- The early `existing.pageCount === pageCount` check runs **before** validation so a redundant set is a
  cheap no-op; an invalid count on a fresh field still surfaces as the helper's `RangeError`
  (`withDocumentPageCount` is the single validation point).
- Barrel: `documents.ts` is already re-exported from `packages/store/src/index.ts` — the new symbol
  rides the existing export (consumer-surface only; Metro-safe carry-forward from 03c/04a). Confirm,
  add nothing test-only.

### Tests
- `packages/core/src/tests/document.test.ts` (extend the existing file):
  - `withDocumentPageCount` sets the field and returns a **new** object (input not mutated — snapshot
    compare; original `pageCount` stays `undefined`).
  - overwriting an existing `pageCount` returns the new value (no special-casing in the pure helper).
  - throws `RangeError` for `0`, `-1`, `1.5`, `NaN`, `Infinity`.
  - `makeDocument` output has `pageCount === undefined` (field stays optional/absent on import).
- `packages/store/src/tests/documents.test.ts` (extend, `MemoryRepository` + fixed `Hlc` + monotonic
  fake `newOutboxId`; import a doc first via `importDocument` to seed a record, OR `repo.put` a fixture
  Document directly):
  - **missing doc** → `setDocumentPageCount` returns `null`, writes nothing (repo unchanged, **no**
    outbox entry beyond any import already enqueued).
  - **fresh set** → returns the updated doc with `pageCount` set; `repo.get` reflects it; exactly **one**
    new outbox entry (`op 'put'`, `recordId === docId`, `payload` deep-equals the updated record).
  - **idempotent** → calling again with the **same** count returns the record and adds **no** further
    outbox entry (count entries before/after are equal).
  - **change** → a different valid count overwrites and enqueues one more outbox entry.
  - **invalid count** (e.g. `0`) on a doc with no stored count → throws `RangeError`, writes nothing.

## Dependencies
- none. Core stays runtime-dep-free; store reuses `@ember/core` (`Document`, `withDocumentPageCount`,
  `makeOutboxEntry`, `Hlc`) + the existing `Repository` interface. No new external dep, no UI.

## Verify when done
- [ ] `Document` gains an **optional** `pageCount`; `makeDocument` + `importDocument` behaviour and
      every existing Document/store test are byte-identical (no import-path regression).
- [ ] `withDocumentPageCount` is pure (no input mutation), validates integer ≥ 1 (throws `RangeError`
      otherwise), and returns an updated copy.
- [ ] `setDocumentPageCount` is set-once/idempotent: missing doc → `null`/no write; same count → no
      write, no outbox entry; new/changed count → one `put` + **exactly one** HLC-stamped outbox entry
      (`op 'put'`, full updated record payload — invariant #2).
- [ ] Barrels export consumer surface only; existing 03/04/06/07/08 conformance + suites still green.
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean.
- [ ] apps/web, apps/mobile, packages/tokens byte-identical to main (core+store-only diff).
- [ ] No invariant in architecture.md violated — esp. #1 (works offline; Convex never on the read path;
      missing-doc set is a graceful no-op), #2 (the page-count write goes through the outbox with an HLC
      stamp), #3 (pageCount is intrinsic document metadata, not a derived aggregate — unaffected),
      and core/store import no platform API.
```
