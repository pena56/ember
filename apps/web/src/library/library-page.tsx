import { useState } from 'react';
import { toast } from 'sonner';

import type { Tag, TagColor } from '@ember/core';

import { useWebStore } from '../store/store-context.js';

import { DocumentCard } from './document-card.js';
import { DocumentDetailsDialog } from './document-details-dialog.js';
import { DocumentRow } from './document-row.js';
import { DuplicatePrompt } from './duplicate-prompt.js';
import { ImportDropzone } from './import-dropzone.js';
import { LibraryViewToggle } from './library-view-toggle.js';
import { RemoveDocumentDialog } from './remove-document-dialog.js';
import { SmartViewBar, isAdHocTagFilter } from './smart-view-bar.js';
import { StorageMeter } from './storage-meter.js';
import { useDuplicates } from './use-duplicates.js';
import { useLibraryTags } from './use-library-tags.js';
import type { DocumentWithSync } from './use-library.js';
import { useViewMode } from './use-view-mode.js';

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="opacity-50"
      >
        <circle cx="28" cy="28" r="27" className="stroke-line" strokeWidth="1.5" />
        <path
          d="M28 10C28 10 18 22 18 32C18 37.523 22.477 42 28 42C33.523 42 38 37.523 38 32C38 26 34 20 32 16C32 16 31 24 28 26C25 24 28 10 28 10Z"
          className="fill-accent opacity-60"
        />
        <path
          d="M28 26C28 26 23 31 23 35C23 37.761 25.239 40 28 40C30.761 40 33 37.761 33 35C33 31 28 26 28 26Z"
          className="fill-surface"
        />
      </svg>

      <div className="flex flex-col gap-2">
        <p className="font-serif text-lg text-text-muted">
          Your library is waiting for its first spark
        </p>
        <p className="font-sans text-sm text-text-muted opacity-70 max-w-xs text-balance">
          Drop a PDF above to begin. Every great collection starts with a single page.
        </p>
      </div>
    </div>
  );
}

// ── Filtered empty state ──────────────────────────────────────────────────────

function FilteredEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="font-serif text-base text-text-muted">Nothing here yet</p>
      <p className="font-sans text-sm text-text-muted opacity-70 max-w-xs text-balance">
        Books you tag will gather here. Try a different view, or add a tag to a book below.
      </p>
    </div>
  );
}

// ── Document list / grid ────────────────────────────────────────────────────────

interface TagHandlers {
  tags: Tag[];
  tagsByDoc: Map<string, Tag[]>;
  onTagDoc: (docId: string, tagId: string) => Promise<void>;
  onUntagDoc: (docId: string, tagId: string) => Promise<void>;
  onCreateTag: (name: string, color: TagColor) => Promise<void>;
  onEditTag: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag: (tag: Tag) => Promise<void>;
  onTagClick: (tagId: string) => void;
}

function DocumentCollection({
  documents,
  totalDocCount,
  viewMode,
  positionsByDoc,
  onOpen,
  onDetails,
  onRemove,
  onRetrySync,
  tagHandlers,
}: {
  documents: DocumentWithSync[];
  totalDocCount: number;
  viewMode: 'list' | 'grid';
  positionsByDoc: Map<string, { page: number }>;
  onOpen: (id: string) => void;
  onDetails: (id: string) => void;
  onRemove: (id: string) => void;
  onRetrySync: () => void;
  tagHandlers: TagHandlers;
}) {
  if (totalDocCount === 0) return <EmptyState />;
  if (documents.length === 0) return <FilteredEmptyState />;

  const listClass =
    viewMode === 'grid'
      ? 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]'
      : 'overflow-hidden rounded-lg border border-line bg-surface-raised shadow-float-sm divide-y divide-line';

  const Item = viewMode === 'grid' ? DocumentCard : DocumentRow;

  return (
    <section aria-label="Your library">
      <ul className={listClass}>
        {documents.map((doc) => {
          const position = positionsByDoc.get(doc.id);
          return (
            <Item
              key={doc.id}
              document={doc}
              onOpen={onOpen}
              onDetails={onDetails}
              onRemove={onRemove}
              tags={tagHandlers.tags}
              appliedTags={tagHandlers.tagsByDoc.get(doc.id) ?? []}
              onTagDoc={(tagId) => tagHandlers.onTagDoc(doc.id, tagId)}
              onUntagDoc={(tagId) => tagHandlers.onUntagDoc(doc.id, tagId)}
              onCreateTag={tagHandlers.onCreateTag}
              onEditTag={tagHandlers.onEditTag}
              onDeleteTag={tagHandlers.onDeleteTag}
              onTagClick={tagHandlers.onTagClick}
              {...(position !== undefined ? { position } : {})}
              {...(doc.syncState === 'over-quota' ? { onRetrySync } : {})}
            />
          );
        })}
      </ul>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface LibraryPageProps {
  onOpen?: (id: string) => void;
  onRetrySync?: () => void;
}

export function LibraryPage({ onOpen, onRetrySync }: LibraryPageProps = {}) {
  const store = useWebStore();
  const [viewMode, setViewMode] = useViewMode();

  const {
    documents,
    totalDocCount,
    loading,
    importFiles,
    tags,
    tagsByDoc,
    smartViews,
    activeView,
    setActiveView,
    positionsByDoc,
    refresh,
  } = useLibraryTags();

  const { current, currentDocs, defaultCanonicalId, merge, keepSeparate, dismiss } = useDuplicates();

  // Details / remove dialog targets (looked up from the current doc set).
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const detailsDoc = documents.find((d) => d.id === detailsId) ?? null;
  const removeDoc = documents.find((d) => d.id === removeId) ?? null;

  // ── Tag handlers ────────────────────────────────────────────────────────────

  async function handleTagDoc(docId: string, tagId: string) {
    await store.tagDoc({ documentId: docId, tagId });
    refresh();
  }
  async function handleUntagDoc(docId: string, tagId: string) {
    await store.untagDoc({ documentId: docId, tagId });
    refresh();
  }
  async function handleCreateTag(name: string, color: TagColor) {
    await store.createTag({ name, color });
    refresh();
  }
  async function handleEditTag(tag: Tag, patch: { name?: string; color?: TagColor }) {
    await store.editTag({ tag, patch });
    refresh();
  }
  async function handleDeleteTag(tag: Tag) {
    await store.deleteTag(tag.id);
    refresh();
  }

  // ── Smart-view handlers ───────────────────────────────────────────────────────

  async function handleRenameView(view: import('@ember/core').SmartView, newName: string) {
    await store.editSmartView({ view, patch: { name: newName } });
    refresh();
  }
  async function handleDeleteView(view: import('@ember/core').SmartView) {
    await store.deleteSmartView(view.id);
    if (activeView.kind === 'saved' && activeView.id === view.id) {
      setActiveView({ kind: 'builtin', key: 'all', query: {} });
    }
    refresh();
  }
  async function handleSaveView(name: string) {
    const view = await store.createSmartView({ name, query: activeView.query });
    refresh();
    setActiveView({ kind: 'saved', id: view.id, query: view.query });
  }
  function handleTagClick(tagId: string) {
    setActiveView({
      kind: 'builtin',
      key: `tag:${tagId}`,
      query: { tagIds: [tagId], tagMatch: 'any' },
    });
  }

  // ── Remove flow ───────────────────────────────────────────────────────────────

  function confirmRemove() {
    const target = removeDoc;
    if (target === null) return;
    setRemoveId(null);
    void store
      .deleteDocument(target.id)
      .then(() => {
        refresh();
        toast.success('Removed from your library', {
          description: `"${target.title}" and its highlights were removed.`,
        });
      })
      .catch(() => {
        toast.error("Couldn't remove that book", {
          description: 'Something went wrong. Please try again.',
        });
      });
  }

  const adHocFilter = isAdHocTagFilter(activeView, activeView.query);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      {/* Header — title + layout toggle */}
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-3xl font-semibold text-text">Library</h2>
          {totalDocCount > 0 && (
            <p className="font-sans text-sm text-text-muted">
              {totalDocCount === 1
                ? '1 book in your collection'
                : `${totalDocCount.toString()} books in your collection`}
            </p>
          )}
        </div>
        {totalDocCount > 0 && (
          <LibraryViewToggle mode={viewMode} onChange={setViewMode} />
        )}
      </header>

      <StorageMeter />

      <ImportDropzone onFiles={(files) => { void importFiles(files); }} disabled={loading} />

      {current !== undefined && currentDocs !== undefined && defaultCanonicalId !== undefined && (
        <DuplicatePrompt
          pair={current}
          docs={currentDocs}
          defaultCanonicalId={defaultCanonicalId}
          onMerge={(canonicalId) => { void merge(current, canonicalId); }}
          onKeepSeparate={() => { void keepSeparate(current); }}
          onDismiss={() => { dismiss(current); }}
        />
      )}

      <SmartViewBar
        smartViews={smartViews}
        activeView={activeView}
        onSelectView={setActiveView}
        isAdHocTagFilter={adHocFilter}
        onRenameView={handleRenameView}
        onDeleteView={handleDeleteView}
        onSaveView={handleSaveView}
      />

      {loading && documents.length === 0 ? (
        <div
          className="flex items-center justify-center py-16"
          role="status"
          aria-label="Loading your library"
        >
          <div className="w-5 h-5 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
        </div>
      ) : (
        <DocumentCollection
          documents={documents}
          totalDocCount={totalDocCount}
          viewMode={viewMode}
          positionsByDoc={positionsByDoc}
          onOpen={onOpen ?? (() => undefined)}
          onDetails={setDetailsId}
          onRemove={setRemoveId}
          onRetrySync={onRetrySync ?? (() => undefined)}
          tagHandlers={{
            tags,
            tagsByDoc,
            onTagDoc: handleTagDoc,
            onUntagDoc: handleUntagDoc,
            onCreateTag: handleCreateTag,
            onEditTag: handleEditTag,
            onDeleteTag: handleDeleteTag,
            onTagClick: handleTagClick,
          }}
        />
      )}

      <DocumentDetailsDialog
        doc={detailsDoc}
        tags={detailsDoc !== null ? (tagsByDoc.get(detailsDoc.id) ?? []) : []}
        position={detailsDoc !== null ? positionsByDoc.get(detailsDoc.id) : undefined}
        open={detailsId !== null}
        onOpenChange={(o) => { if (!o) setDetailsId(null); }}
      />

      <RemoveDocumentDialog
        title={removeDoc?.title ?? null}
        open={removeId !== null}
        onOpenChange={(o) => { if (!o) setRemoveId(null); }}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
