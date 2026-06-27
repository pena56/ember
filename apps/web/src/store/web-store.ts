import type { Annotation, AnnotationKind, BlobStatus, Document, DuplicateDecision, FlushedSession, Hasher, HighlightColor, ReadingPosition, ReadingSession, TextAnchor } from '@ember/core';
import { BLOB_SYNC_COLLECTION, DUPLICATE_DECISIONS_COLLECTION, editAnnotation, makeAnnotation, makeDuplicateDecision, makeOutboxEntry } from '@ember/core';
import type { BlobStore, GoalConfigRecord, ImportResult, Repository } from '@ember/store';
import { deleteAnnotation as deleteAnnotationRecord, getGoalConfig, getReadingPosition, importDocument, listAnnotations, listDocuments, listReadingPositions, listSessions, recordSession, saveAnnotation, saveReadingPosition, setDocumentPageCount } from '@ember/store';

import type { WebClock } from './web-clock.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WebStore {
  importPdf(file: File): Promise<ImportResult>;
  listDocuments(): Promise<Document[]>;
  /** Read back the raw PDF bytes for a stored document by id. Returns undefined when the blob is not found. */
  getPdfBytes(id: string): Promise<Uint8Array | undefined>;
  /** Upsert the current reading position for a document (last-write). */
  saveReadingPosition(input: { docId: string; page: number; offset: number }): Promise<ReadingPosition>;
  /** Return the stored reading position for a document, or undefined if none saved. */
  getReadingPosition(docId: string): Promise<ReadingPosition | undefined>;
  /** Return all saved reading positions (unsorted — sort/join is a UI concern). */
  listReadingPositions(): Promise<ReadingPosition[]>;
  /** Append one immutable ReadingSession + one outbox entry. */
  recordSession(flushed: FlushedSession): Promise<ReadingSession>;
  /** Return all reading sessions (unfiltered — derivation needs the whole log). */
  listSessions(): Promise<ReadingSession[]>;
  /** Return the stored goal config, or the unpersisted 20-min default when unset. */
  getGoalConfig(): Promise<GoalConfigRecord>;
  /** Persist a document's total page count (set-once / idempotent — see 09a). Returns the
   *  updated record, or null when the document isn't found. */
  setDocumentPageCount(docId: string, pageCount: number): Promise<Document | null>;
  /**
   * Create a new annotation (highlight or note), write one record + one HLC-stamped
   * outbox entry (invariant #2), and return the persisted Annotation.
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
  /**
   * Return all local blob-sync status records. Read-only; no enqueue.
   * Used by the library UI to show per-row sync badges.
   */
  listBlobStatuses(): Promise<BlobStatus[]>;
  /** Return all persisted duplicate decisions (read-only). */
  listDuplicateDecisions(): Promise<DuplicateDecision[]>;
  /**
   * Persist a duplicate-pair decision. Writes exactly one record + one
   * HLC-stamped outbox entry (invariant #2). The pair key is order-independent
   * so concurrent cross-device decisions LWW-converge.
   */
  saveDuplicateDecision(input: {
    aId: string;
    bId: string;
    canonicalId: string;
    decision: 'merged' | 'separate';
  }): Promise<DuplicateDecision>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Compose the injected platform capabilities into the WebStore surface.
 *
 * All deps are injectable so tests can pass MemoryRepository + MemoryBlobStore
 * + subtleCryptoHasher + a createWebClock over in-memory storage. Production
 * builds the real DexieRepository + OpfsBlobStore + createWebClock().
 */
export function createWebStore(deps: {
  repo: Repository;
  blobs: BlobStore;
  hasher: Hasher;
  clock: WebClock;
}): WebStore {
  const { repo, blobs, hasher, clock } = deps;

  return {
    async importPdf(file: File): Promise<ImportResult> {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      return importDocument(
        {
          repo,
          blobs,
          hasher,
          newOutboxId: () => clock.newOutboxId(),
          hlc: clock.nextStamp(),
          now: clock.now(),
        },
        {
          bytes,
          filename: file.name,
          contentType: 'application/pdf',
        },
      );
    },

    async listDocuments(): Promise<Document[]> {
      const docs = await listDocuments(repo);
      // Recently-added-first: sort descending by importedAt
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
      const hlc = clock.nextStamp();
      const next = editAnnotation(input.annotation, input.patch, { hlc });
      return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, next);
    },

    async deleteAnnotation(id: string): Promise<void> {
      return deleteAnnotationRecord(
        { repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() },
        id,
      );
    },

    async listBlobStatuses(): Promise<BlobStatus[]> {
      return repo.query<BlobStatus>(BLOB_SYNC_COLLECTION);
    },

    async listDuplicateDecisions(): Promise<DuplicateDecision[]> {
      return repo.query<DuplicateDecision>(DUPLICATE_DECISIONS_COLLECTION);
    },

    async saveDuplicateDecision(input: {
      aId: string;
      bId: string;
      canonicalId: string;
      decision: 'merged' | 'separate';
    }): Promise<DuplicateDecision> {
      const hlc = clock.nextStamp();
      const rec = makeDuplicateDecision({ ...input, hlc });
      await repo.put(DUPLICATE_DECISIONS_COLLECTION, rec);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: DUPLICATE_DECISIONS_COLLECTION,
          recordId: rec.id,
          op: 'put',
          payload: rec,
        }),
      );
      return rec;
    },
  };
}
