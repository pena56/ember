import type { Annotation, AnnotationKind, BlobStatus, DocTag, Document, DuplicateDecision, FlushedSession, Hasher, HighlightColor, NotificationPreferences, ReadingPosition, ReadingSession, SmartView, SmartViewQuery, Tag, TagColor, TextAnchor } from '@ember/core';
import { BLOB_SYNC_COLLECTION, DOC_TAGS_COLLECTION, DUPLICATE_DECISIONS_COLLECTION, SMART_VIEWS_COLLECTION, TAGS_COLLECTION, docTagId, editAnnotation, editSmartView, editTag, makeAnnotation, makeDocTag, makeDuplicateDecision, makeOutboxEntry, makeSmartView, makeTag } from '@ember/core';
import type { BlobStore, GoalConfigRecord, ImportResult, NotificationPreferencesRecord, Repository } from '@ember/store';
import { deleteAnnotation as deleteAnnotationRecord, getGoalConfig, getNotificationPreferences, getReadingPosition, importDocument, listAnnotations, listDocuments, listReadingPositions, listSessions, recordSession, saveAnnotation, saveReadingPosition, setDocumentPageCount, setNotificationPreferences } from '@ember/store';

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
  /**
   * Return the stored notification preferences, or an unpersisted default when nothing
   * is saved yet. Read-only passthrough — no outbox write (invariant #2 untouched).
   * The default has `updatedAt: ''` so any subsequent `setNotificationPreferences` call
   * wins by HLC compare.
   */
  getNotificationPreferences(): Promise<NotificationPreferencesRecord>;
  /**
   * Persist the user's notification preferences and enqueue exactly one HLC-stamped
   * outbox entry (invariant #2). ONE `clock.nextStamp()` call per invocation — the
   * same stamp is used as the record's `updatedAt` and the outbox entry's `hlc`
   * so they agree (invariant #2). Cross-device conflicts resolve last-write-wins via
   * the reconciler.
   */
  setNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferencesRecord>;
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

  // ── Tags (15b) ─────────────────────────────────────────────────────────────
  /** Return all stored tags (unsorted). */
  listTags(): Promise<Tag[]>;
  /** Return all stored doc-tag links (unsorted). */
  listDocTags(): Promise<DocTag[]>;
  /** Return all stored smart views (unsorted). */
  listSmartViews(): Promise<SmartView[]>;
  /**
   * Create a new tag. One HLC stamp shared by the record's updatedAt and
   * the outbox entry (invariant #2). Color defaults to DEFAULT_TAG_COLOR.
   */
  createTag(input: { name: string; color?: TagColor }): Promise<Tag>;
  /**
   * Rename or recolor an existing tag. One HLC stamp (invariant #2).
   */
  editTag(input: { tag: Tag; patch: { name?: string; color?: TagColor } }): Promise<Tag>;
  /**
   * Delete a tag. Removes the record + enqueues one delete tombstone (invariant #2).
   * Links and smart-view queries referencing the tag go inert at resolve-time — no fan-out.
   */
  deleteTag(id: string): Promise<void>;
  /**
   * Tag a document (create a doc-tag link). id is deterministic (docTagId).
   * Re-tagging the same pair converges by LWW (invariant #2).
   */
  tagDoc(input: { documentId: string; tagId: string }): Promise<DocTag>;
  /**
   * Untag a document. Removes the link + enqueues a delete tombstone (invariant #2).
   */
  untagDoc(input: { documentId: string; tagId: string }): Promise<void>;
  /**
   * Create a new saved smart view. One HLC stamp (invariant #2).
   */
  createSmartView(input: { name: string; query: SmartViewQuery }): Promise<SmartView>;
  /**
   * Rename or re-query a smart view. One HLC stamp (invariant #2).
   */
  editSmartView(input: { view: SmartView; patch: { name?: string; query?: SmartViewQuery } }): Promise<SmartView>;
  /**
   * Delete a saved smart view. Removes the record + enqueues a delete tombstone (invariant #2).
   */
  deleteSmartView(id: string): Promise<void>;
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

    async getNotificationPreferences(): Promise<NotificationPreferencesRecord> {
      return getNotificationPreferences(repo);
    },

    async setNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferencesRecord> {
      return setNotificationPreferences(
        { repo, hlc: clock.nextStamp(), newOutboxId: () => clock.newOutboxId() },
        prefs,
      );
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

    // ── Tags (15b) ─────────────────────────────────────────────────────────────

    async listTags(): Promise<Tag[]> {
      return repo.query<Tag>(TAGS_COLLECTION);
    },

    async listDocTags(): Promise<DocTag[]> {
      return repo.query<DocTag>(DOC_TAGS_COLLECTION);
    },

    async listSmartViews(): Promise<SmartView[]> {
      return repo.query<SmartView>(SMART_VIEWS_COLLECTION);
    },

    async createTag(input: { name: string; color?: TagColor }): Promise<Tag> {
      const hlc = clock.nextStamp();
      const rec = makeTag(
        {
          id: clock.newId(),
          name: input.name,
          ...(input.color !== undefined ? { color: input.color } : {}),
          createdAt: clock.now(),
        },
        { hlc },
      );
      await repo.put(TAGS_COLLECTION, rec);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: TAGS_COLLECTION,
          recordId: rec.id,
          op: 'put',
          payload: rec,
        }),
      );
      return rec;
    },

    async editTag(input: { tag: Tag; patch: { name?: string; color?: TagColor } }): Promise<Tag> {
      const hlc = clock.nextStamp();
      const rec = editTag(input.tag, input.patch, { hlc });
      await repo.put(TAGS_COLLECTION, rec);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: TAGS_COLLECTION,
          recordId: rec.id,
          op: 'put',
          payload: rec,
        }),
      );
      return rec;
    },

    async deleteTag(id: string): Promise<void> {
      const hlc = clock.nextStamp();
      await repo.delete(TAGS_COLLECTION, id);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: TAGS_COLLECTION,
          recordId: id,
          op: 'delete',
        }),
      );
    },

    async tagDoc(input: { documentId: string; tagId: string }): Promise<DocTag> {
      const hlc = clock.nextStamp();
      const rec = makeDocTag(
        { documentId: input.documentId, tagId: input.tagId, createdAt: clock.now() },
        { hlc },
      );
      await repo.put(DOC_TAGS_COLLECTION, rec);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: DOC_TAGS_COLLECTION,
          recordId: rec.id,
          op: 'put',
          payload: rec,
        }),
      );
      return rec;
    },

    async untagDoc(input: { documentId: string; tagId: string }): Promise<void> {
      const hlc = clock.nextStamp();
      const id = docTagId(input.documentId, input.tagId);
      await repo.delete(DOC_TAGS_COLLECTION, id);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: DOC_TAGS_COLLECTION,
          recordId: id,
          op: 'delete',
        }),
      );
    },

    async createSmartView(input: { name: string; query: SmartViewQuery }): Promise<SmartView> {
      const hlc = clock.nextStamp();
      const rec = makeSmartView(
        { id: clock.newId(), name: input.name, query: input.query, createdAt: clock.now() },
        { hlc },
      );
      await repo.put(SMART_VIEWS_COLLECTION, rec);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: SMART_VIEWS_COLLECTION,
          recordId: rec.id,
          op: 'put',
          payload: rec,
        }),
      );
      return rec;
    },

    async editSmartView(input: { view: SmartView; patch: { name?: string; query?: SmartViewQuery } }): Promise<SmartView> {
      const hlc = clock.nextStamp();
      const rec = editSmartView(input.view, input.patch, { hlc });
      await repo.put(SMART_VIEWS_COLLECTION, rec);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: SMART_VIEWS_COLLECTION,
          recordId: rec.id,
          op: 'put',
          payload: rec,
        }),
      );
      return rec;
    },

    async deleteSmartView(id: string): Promise<void> {
      const hlc = clock.nextStamp();
      await repo.delete(SMART_VIEWS_COLLECTION, id);
      await repo.enqueue(
        makeOutboxEntry({
          id: clock.newOutboxId(),
          hlc,
          collection: SMART_VIEWS_COLLECTION,
          recordId: id,
          op: 'delete',
        }),
      );
    },
  };
}
