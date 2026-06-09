# Unit 04a: Document model + SHA-256 identity + importDocument use-case

Issue: #34 (part of umbrella #4) · Branch: feat/34-document-model-identity · Boundary: packages/core + packages/store
Route: standard — shared pure-TS brain (core+store), no new dep, no UI; spec fully resolved (mirrors 03a).

First slice of Unit 04 (Import + document identity + Library list), split COMPLEX→sub-units per the
02/03 epic pattern: **04a** shared brain (this) → **04b** web import + Library list → **04c** mobile
import + Library list (device-bound). 04a is fully headless-testable; no file picker, no real crypto,
no UI here.

## Goal
Define the platform-agnostic document layer: a `Document` record type, SHA-256 content identity via a
`Hasher` port, a `BlobStore` port (+ in-memory reference impl), and an `importDocument` use-case that
hashes bytes, **dedupes by content id**, and atomically persists the metadata record + blob + a single
HLC-stamped outbox entry. Identical bytes imported twice yield one document and one outbox entry.

## Implementation

### `packages/core/src/document.ts` (new)
- `export type Document = { id: string; title: string; filename: string; byteSize: number; contentType: string; importedAt: number }`.
  `id` is the lowercase-hex SHA-256 of the file bytes (this is `RecordBase.id`). `importedAt` is physical
  ms supplied by the caller (no `Date.now()` in core — same rule as `hlc`/`outbox`). **No `pageCount`** —
  that needs PDF parsing and lands with the reader (unit 05).
- `export interface Hasher { sha256Hex(bytes: Uint8Array): Promise<string> }` — the only platform
  capability; real bindings (web SubtleCrypto, mobile expo-crypto) arrive in 04b/04c. Mirrors the 03c
  `SqliteDriver` port pattern.
- `export async function computeDocumentId(bytes: Uint8Array, hasher: Hasher): Promise<string>` —
  thin wrapper returning `hasher.sha256Hex(bytes)`; the seam every caller and test goes through.
- `export function makeDocument(args: { id: string; filename: string; byteSize: number; contentType: string; importedAt: number; title?: string }): Document`
  — pure factory; `title` defaults to the filename with its extension stripped (e.g. `report.pdf` → `report`).
- Keep core **runtime-dep-free** (no zod): `Document` is a plain type + factory. Validation of untrusted
  picker input is deferred to the client-import boundary (04b/04c) / convex (unit 12).
- Re-export from `packages/core/src/index.ts` (`export * from './document.js'`).

### `packages/store/src/blob-store.ts` (new)
- `export interface BlobStore { put(id: string, bytes: Uint8Array): Promise<void>; get(id: string): Promise<Uint8Array | undefined>; has(id: string): Promise<boolean>; delete(id: string): Promise<void>; close(): Promise<void> }`
  — content-addressed by document id (sha256). Bindings: OPFS (04b), expo-file-system documentDirectory (04c).
- Contract notes in TSDoc (mirror Repository style): `put` overwrites; impls MUST copy bytes on
  put/get so callers can't mutate stored state by reference (value-isolation parallel to Repository);
  `close()` is idempotent.
- Barrel-export from `index.ts`.

### `packages/store/src/memory-blob-store.ts` (new)
- `export class MemoryBlobStore implements BlobStore` — reference impl backed by a `Map<string, Uint8Array>`;
  copies bytes in/out (`Uint8Array.prototype.slice()`); idempotent `close()`. Mirrors `MemoryRepository`.
- Barrel-export from `index.ts`.

### `packages/store/src/documents.ts` (new)
- `export const DOCUMENTS_COLLECTION = 'documents'`.
- `export type ImportResult = { document: Document; deduped: boolean }`.
- `export async function importDocument(deps, input): Promise<ImportResult>` where
  `deps: { repo: Repository; blobs: BlobStore; hasher: Hasher; newOutboxId: () => string; hlc: Hlc; now: number }`
  and `input: { bytes: Uint8Array; filename: string; contentType: string; title?: string }`.
  Steps:
  1. `id = await computeDocumentId(input.bytes, deps.hasher)`.
  2. If `await repo.get(DOCUMENTS_COLLECTION, id)` exists → return `{ document: existing, deduped: true }`
     — **no** blob rewrite, **no** second outbox entry (idempotent import; invariant #2 not re-fired).
  3. Else: `doc = makeDocument({ id, filename, byteSize: bytes.byteLength, contentType, importedAt: now, title })`;
     `await blobs.put(id, bytes)`; `await repo.put(DOCUMENTS_COLLECTION, doc)`;
     `await repo.enqueue(makeOutboxEntry({ id: newOutboxId(), hlc, collection: DOCUMENTS_COLLECTION, recordId: id, op: 'put', payload: doc }))`;
     return `{ document: doc, deduped: false }`.
  - `Hlc`/`makeOutboxEntry` imported from `@ember/core`; caller supplies `hlc`, `now`, and `newOutboxId`
    (uuid) — core/store stay platform-free, consistent with 03a.
- `export async function listDocuments(repo: Repository): Promise<Document[]>` —
  `repo.query<Document>(DOCUMENTS_COLLECTION)`; flat list (sort/order is a 04b/04c UI concern).
- Barrel-export from `index.ts`.

### `packages/store/src/blob-store-conformance.ts` (new, test-only)
- `export function runBlobStoreConformance(label: string, makeBlobs: () => BlobStore): void` — `describe`
  block covering: put→get round-trips bytes; `has` true/false; overwrite replaces; `delete` removes;
  value isolation (mutating returned/input bytes doesn't corrupt stored copy); idempotent `close()`.
  Imports `vitest`. **Do NOT barrel-export** (carry-forward from 03c — Metro must never pull a
  vitest/node-only module from `@ember/store`'s barrel); 04b/04c import it via relative path.

### Tests (`packages/store/src/tests/`)
- `memory-blob-store.test.ts`: `runBlobStoreConformance('MemoryBlobStore', () => new MemoryBlobStore())`.
- `documents.test.ts`: a deterministic **fake Hasher** (e.g. hex of a stable digest of bytes — only needs
  determinism + collision-freedom for distinct test inputs; real SHA-256 is verified on-device/in-browser
  in 04b/04c) + `MemoryRepository` + `MemoryBlobStore`. Cases: import-new writes record + blob + exactly
  one outbox entry with `recordId === id`; re-import identical bytes → `deduped: true`, still one record /
  one outbox entry / blob untouched; different bytes → distinct id, second record + second outbox entry;
  `makeDocument` title derives from filename and is overridable; `listDocuments` returns all imported docs.
- core `document.test.ts`: `makeDocument` title-stripping + field mapping; `computeDocumentId` delegates to
  the hasher.

## Dependencies
- none. Core stays runtime-dep-free; store adds no new dep (uses existing `@ember/core`). zod deferred to
  the client-import boundary (04b/04c).

## Verify when done
- [ ] Importing new bytes persists a `Document` record + blob + exactly one HLC-stamped outbox entry; the
      record id equals the SHA-256 hex of the bytes.
- [ ] Re-importing identical bytes is a no-op merge (`deduped: true`): one record, one outbox entry, blob unchanged.
- [ ] `MemoryBlobStore` passes `runBlobStoreConformance`; `MemoryRepository`/`DexieRepository`/`SqliteRepository`
      conformance still green (03a/b/c untouched).
- [ ] Barrel (`packages/store/src/index.ts`) exports the consumer surface only — `blob-store-conformance.ts`
      is NOT re-exported (Metro-safe).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (works offline, Convex never on read path),
      #2 (every syncable mutation through the outbox with an HLC stamp), and core/store import no platform API.
