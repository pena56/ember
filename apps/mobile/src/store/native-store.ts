import type { Annotation, AnnotationKind, Document, FlushedSession, Hasher, HighlightColor, ReadingPosition, ReadingSession, TextAnchor } from '@ember/core';
import { editAnnotation, makeAnnotation } from '@ember/core';
import type { BlobStore, GoalConfigRecord, ImportResult, Repository } from '@ember/store';
import { deleteAnnotation as deleteAnnotationRecord, getGoalConfig, getReadingPosition, importDocument, listAnnotations, listDocuments, listReadingPositions, listSessions, recordSession, saveAnnotation, saveReadingPosition, setDocumentPageCount } from '@ember/store';

import type { NativeClock } from './native-clock.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NativeStore {
  /**
   * Import a PDF from raw bytes.
   *
   * The bytes are already read by the caller (pick-pdf.ts), keeping this
   * composition layer pure (no native file-system or picker dependency).
   */
  importPdf(bytes: Uint8Array, filename: string, contentType?: string): Promise<ImportResult>;
  /** Return all documents, sorted recently-added-first. */
  listDocuments(): Promise<Document[]>;
  /**
   * Read back the raw PDF bytes for a stored document.
   *
   * Returns `undefined` if no blob exists for the given id (e.g. missing or
   * never imported). Mirror of web-store's `getPdfBytes` (05a).
   */
  getPdfBytes(id: string): Promise<Uint8Array | undefined>;
  /**
   * Upsert the current reading position for a document (last-write, not furthest).
   * Writes one ReadingPosition record + one HLC-stamped outbox entry (invariant #2).
   * Mirrors web-store's saveReadingPosition (06b).
   */
  saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition>;
  /**
   * Return the stored reading position for a document, or undefined if none saved.
   * Used by the reader to resume where the user left off.
   */
  getReadingPosition(docId: string): Promise<ReadingPosition | undefined>;
  /** Return all stored reading positions (unsorted; the selector handles ordering). */
  listReadingPositions(): Promise<ReadingPosition[]>;
  /**
   * Persist a flushed reading session and enqueue one HLC-stamped outbox entry.
   * Append-only: id is a fresh uuid per call (invariant #3).
   * Writes exactly one ReadingSession record + one outbox entry per call (invariant #2).
   */
  recordSession(flushed: FlushedSession): Promise<ReadingSession>;
  /**
   * Return the full session log (no filter) for habit derivation.
   * Read-only: feeds `deriveHabitSummary` on the Today tab (08c). Streaks/goal
   * are always derived on read, never stored (invariant #3).
   */
  listSessions(): Promise<ReadingSession[]>;
  /**
   * Return the stored daily-goal config, or the unpersisted 20-min default when
   * unset (per 08a). Read-only — editing the target is the Settings unit (17),
   * so no write/outbox path lives here (invariants #2/#5 untouched).
   */
  getGoalConfig(): Promise<GoalConfigRecord>;
  /**
   * Persist a document's total page count (set-once / idempotent — see 09a). Writes the updated
   * Document record + exactly one HLC-stamped outbox entry only when the count actually changes;
   * a no-op (no write) when the stored count already matches. Returns the updated record, or null
   * when the document isn't found. Called by the reader (09c) when pdf.js reports numPages.
   */
  setDocumentPageCount(docId: string, pageCount: number): Promise<Document | null>;
  /**
   * Create a new annotation (highlight or note), write one record + one HLC-stamped
   * outbox entry (invariant #2), and return the persisted Annotation.
   *
   * ONE `clock.nextStamp()` call is shared by `makeAnnotation` and the outbox entry
   * so the record's `updatedAt` equals the outbox `hlc` (invariant #2 — same stamp).
   * Mirrors web-store's `createAnnotation` verbatim.
   */
  createAnnotation(input: {
    docId: string;
    kind: AnnotationKind;
    anchor: TextAnchor;
    color?: HighlightColor;
    note?: string;
  }): Promise<Annotation>;
  /** Return all saved annotations for a document (sorted by createdAt ascending). */
  listAnnotations(docId: string): Promise<Annotation[]>;
  /**
   * Edit an existing annotation (recolor / add/update/clear note). One HLC stamp
   * shared by the updated record + its single outbox put entry (invariant #2).
   * Preserves id/createdAt/anchor; bumps `updatedAt`. Mirrors web-store 10c.
   */
  updateAnnotation(input: {
    annotation: Annotation;
    patch: { color?: HighlightColor; note?: string | null };
  }): Promise<Annotation>;
  /**
   * Delete an annotation by id. Removes the record + enqueues one HLC-stamped
   * delete tombstone outbox entry (invariant #2).
   */
  deleteAnnotation(id: string): Promise<void>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Compose injected platform capabilities into the NativeStore surface.
 *
 * All deps are injectable so tests can pass MemoryRepository + MemoryBlobStore
 * + a fake Hasher + createNativeClock over in-memory storage. Production wires
 * up SqliteRepository + ExpoFileSystemBlobStore + expoCryptoHasher + createNativeClock().
 */
export function createNativeStore(deps: {
  repo: Repository;
  blobs: BlobStore;
  hasher: Hasher;
  clock: NativeClock;
}): NativeStore {
  const { repo, blobs, hasher, clock } = deps;

  return {
    async importPdf(bytes, filename, contentType = 'application/pdf'): Promise<ImportResult> {
      return importDocument(
        {
          repo,
          blobs,
          hasher,
          newOutboxId: () => clock.newOutboxId(),
          hlc: clock.nextStamp(),
          now: clock.now(),
        },
        { bytes, filename, contentType },
      );
    },

    async listDocuments(): Promise<Document[]> {
      const docs = await listDocuments(repo);
      // Recently-added-first: sort descending by importedAt (UI concern)
      return [...docs].sort((a, b) => b.importedAt - a.importedAt);
    },

    async getPdfBytes(id: string): Promise<Uint8Array | undefined> {
      return blobs.get(id);
    },

    async saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition> {
      return saveReadingPosition(
        { repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        input,
      );
    },

    async getReadingPosition(docId: string): Promise<ReadingPosition | undefined> {
      return getReadingPosition(repo, docId);
    },

    async listReadingPositions(): Promise<ReadingPosition[]> {
      return listReadingPositions(repo);
    },

    async recordSession(flushed: FlushedSession): Promise<ReadingSession> {
      return recordSession(
        { repo, newId: () => clock.newId(), newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        flushed,
      );
    },

    async listSessions(): Promise<ReadingSession[]> {
      return listSessions(repo);
    },

    async getGoalConfig(): Promise<GoalConfigRecord> {
      return getGoalConfig(repo);
    },

    async setDocumentPageCount(docId: string, pageCount: number): Promise<Document | null> {
      return setDocumentPageCount(
        { repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        docId,
        pageCount,
      );
    },

    async createAnnotation(input: {
      docId: string;
      kind: AnnotationKind;
      anchor: TextAnchor;
      color?: HighlightColor;
      note?: string;
    }): Promise<Annotation> {
      // ONE nextStamp() shared by makeAnnotation (updatedAt) and the outbox entry (hlc).
      // Invariant #2: every create = exactly one HLC-stamped outbox put entry.
      const hlc = clock.nextStamp();
      const annotation = makeAnnotation(
        {
          id: clock.newId(),
          docId: input.docId,
          kind: input.kind,
          anchor: input.anchor,
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          createdAt: clock.now(),
        },
        { hlc },
      );
      return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, annotation);
    },

    async listAnnotations(docId: string): Promise<Annotation[]> {
      const list = await listAnnotations(repo, docId);
      return [...list].sort((a, b) => a.createdAt - b.createdAt);
    },

    async updateAnnotation(input: {
      annotation: Annotation;
      patch: { color?: HighlightColor; note?: string | null };
    }): Promise<Annotation> {
      // ONE nextStamp() shared by editAnnotation (updatedAt) and the outbox entry (hlc).
      // Invariant #2: every edit = exactly one HLC-stamped outbox put entry.
      const hlc = clock.nextStamp();
      const next = editAnnotation(input.annotation, input.patch, { hlc });
      return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, next);
    },

    async deleteAnnotation(id: string): Promise<void> {
      // Invariant #2: one delete = exactly one HLC-stamped delete tombstone.
      return deleteAnnotationRecord(
        { repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        id,
      );
    },
  };
}
