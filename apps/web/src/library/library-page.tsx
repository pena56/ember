import type { ThemePreference } from '../theme/resolve-app-theme.js';
import { useTheme } from '../theme/use-theme.js';

import { DocumentRow } from './document-row.js';
import { ImportDropzone } from './import-dropzone.js';
import { useLibrary } from './use-library.js';
import type { Notice } from './use-library.js';

// ── Theme control ─────────────────────────────────────────────────────────────

const PREFERENCES: ThemePreference[] = ['system', 'warm-light', 'warm-dark'];
const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'warm-light': 'Light',
  'warm-dark': 'Dark',
};

function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="flex rounded-md overflow-hidden border border-line bg-surface-raised"
      role="group"
      aria-label="Theme"
    >
      {PREFERENCES.map((pref) => (
        <button
          key={pref}
          type="button"
          onClick={() => {
            setPreference(pref);
          }}
          aria-pressed={preference === pref}
          className={[
            'font-sans text-sm px-3 py-1.5 transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            preference === pref
              ? 'text-text border-b-2 border-accent font-medium'
              : 'text-text-muted hover:text-text border-b-2 border-transparent',
          ].join(' ')}
        >
          {LABELS[pref]}
        </button>
      ))}
    </div>
  );
}

// ── Notice banner ─────────────────────────────────────────────────────────────

const NOTICE_STYLES: Record<Notice['kind'], string> = {
  added: 'bg-accent/10 border-accent/30 text-accent',
  deduped: 'bg-surface-raised border-line text-text-muted',
  rejected: 'bg-surface-raised border-line text-text-muted',
};

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-center justify-between gap-4 px-4 py-3 rounded-lg border font-sans text-sm',
        NOTICE_STYLES[notice.kind],
      ].join(' ')}
    >
      <span>{notice.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className="shrink-0 p-2 -m-2 rounded opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

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

function DocumentList({ documents }: { documents: ReturnType<typeof useLibrary>['documents'] }) {
  if (documents.length === 0) {
    return <EmptyState />;
  }

  return (
    <section aria-label="Your library">
      <ul className="rounded-xl overflow-hidden bg-surface-raised border border-line divide-y divide-line">
        {documents.map((doc) => (
          <DocumentRow key={doc.id} document={doc} />
        ))}
      </ul>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LibraryPage() {
  const { documents, loading, notice, importFiles, dismissNotice } = useLibrary();

  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface border-b border-line">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between gap-4">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-text">
            Ember
          </h1>
          <ThemeControl />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-8 flex flex-col gap-6">
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

        {/* Import dropzone */}
        <ImportDropzone onFiles={(files) => { void importFiles(files); }} disabled={loading} />

        {/* Inline notice */}
        {notice !== null && (
          <NoticeBanner notice={notice} onDismiss={dismissNotice} />
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
          <DocumentList documents={documents} />
        )}
      </main>
    </div>
  );
}
