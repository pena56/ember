import { DocumentRow } from './document-row.js';
import { DuplicatePrompt } from './duplicate-prompt.js';
import { ImportDropzone } from './import-dropzone.js';
import { StorageMeter } from './storage-meter.js';
import { useDuplicates } from './use-duplicates.js';
import { useLibrary } from './use-library.js';
import type { DocumentWithSync } from './use-library.js';

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      {/* Soft ember motif */}
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

// ── Document list ─────────────────────────────────────────────────────────────

function DocumentList({
  documents,
  onOpen,
  onRetrySync,
}: {
  documents: DocumentWithSync[];
  onOpen: (id: string) => void;
  onRetrySync: () => void;
}) {
  if (documents.length === 0) {
    return <EmptyState />;
  }

  return (
    <section aria-label="Your library">
      <ul className="rounded-xl overflow-hidden bg-surface-raised border border-line divide-y divide-line">
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            document={doc}
            onOpen={onOpen}
            {...(doc.syncState === 'over-quota' && onRetrySync !== undefined
              ? { onRetrySync }
              : {})}
          />
        ))}
      </ul>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface LibraryPageProps {
  /** Called when the user opens a document row. */
  onOpen?: (id: string) => void;
  /**
   * Called when the user taps "Try again" on an over-quota deferred row.
   * Provided by App.tsx which holds the useBlobSync hook (avoids a nested
   * useConvexAuth that would require a ConvexProvider in tests).
   */
  onRetrySync?: () => void;
}

export function LibraryPage({ onOpen, onRetrySync }: LibraryPageProps = {}) {
  const { documents, loading, importFiles } = useLibrary();
  const { current, currentDocs, defaultCanonicalId, merge, keepSeparate, dismiss } = useDuplicates();

  return (
    <div className="flex flex-col gap-6 mx-auto w-full max-w-2xl px-6 py-8">
        {/* Page title */}
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-3xl font-semibold text-text">Library</h2>
          {documents.length > 0 && (
            <p className="font-sans text-sm text-text-muted">
              {documents.length === 1
                ? '1 book in your collection'
                : `${documents.length.toString()} books in your collection`}
            </p>
          )}
        </div>

        {/* Quota meter — hidden while unauthenticated / loading */}
        <StorageMeter />

        {/* Import dropzone */}
        <ImportDropzone onFiles={(files) => { void importFiles(files); }} disabled={loading} />

        {/* Duplicate prompt — shown when an undecided pair exists, one at a time */}
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

        {/* Document list / empty state */}
        {loading && documents.length === 0 ? (
          <div
            className="flex items-center justify-center py-16"
            role="status"
            aria-label="Loading your library"
          >
            <div className="w-5 h-5 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
          </div>
        ) : (
          <DocumentList
            documents={documents}
            onOpen={onOpen ?? (() => undefined)}
            onRetrySync={onRetrySync ?? (() => undefined)}
          />
        )}
    </div>
  );
}
