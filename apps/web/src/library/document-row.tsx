import type { Document } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

import type { SyncState } from './use-library.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: Document & { syncState?: SyncState };
  onOpen: (id: string) => void;
  /** Called when the user taps "Try again" on an over-quota deferred row. */
  onRetrySync?: () => void;
}

// ── PDF page icon ─────────────────────────────────────────────────────────────

function PdfIcon() {
  return (
    <svg
      width="32"
      height="36"
      viewBox="0 0 32 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="32" height="36" rx="4" className="fill-line" />
      {/* dog-ear fold */}
      <path d="M22 0 L32 10 L22 10 Z" className="fill-surface" />
      {/* PDF label lines */}
      <rect x="6" y="16" width="12" height="2" rx="1" className="fill-text-muted opacity-60" />
      <rect x="6" y="21" width="18" height="2" rx="1" className="fill-text-muted opacity-40" />
      <rect x="6" y="26" width="14" height="2" rx="1" className="fill-text-muted opacity-40" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

// ── Sync badge ────────────────────────────────────────────────────────────────

function SyncBadge({
  syncState,
  onRetrySync,
}: {
  syncState: SyncState;
  onRetrySync?: () => void;
}) {
  if (syncState === 'synced') {
    // Subtle — no alarming badge; just a calm indicator
    return null;
  }

  if (syncState === 'pending') {
    return (
      <span className="font-sans text-xs text-text-muted opacity-60 shrink-0">
        Syncing…
      </span>
    );
  }

  if (syncState === 'over-file-cap') {
    return (
      <span className="font-sans text-xs text-text-muted shrink-0 max-w-[160px] text-right leading-tight">
        Too large to sync — kept on this device
      </span>
    );
  }

  if (syncState === 'over-quota') {
    return (
      <span className="flex flex-col items-end gap-1 shrink-0">
        <span className="font-sans text-xs text-text-muted max-w-[160px] text-right leading-tight">
          Storage full — kept on this device
        </span>
        {onRetrySync !== undefined && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetrySync();
            }}
            className={[
              // pointer-events-auto: re-enable clicks on this control — the content
              // layer it sits in is pointer-events-none so row clicks fall through to
              // the full-row open button beneath (avoids an invalid nested <button>).
              'pointer-events-auto font-sans text-xs text-accent underline-offset-2 hover:underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm',
            ].join(' ')}
          >
            Try again
          </button>
        )}
      </span>
    );
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentRow({ document: doc, onOpen, onRetrySync }: DocumentRowProps) {
  const syncState = doc.syncState;

  return (
    <li className="relative">
      {/*
        Full-row open affordance as a base layer. The visible content sits in a
        sibling layer above with pointer-events-none, so the whole row stays
        clickable to open — while the over-quota "Try again" control re-enables
        its own pointer events. This avoids nesting an interactive button inside
        the row button (invalid HTML / a11y).
      */}
      <button
        type="button"
        onClick={() => { onOpen(doc.id); }}
        aria-label={`Open ${doc.title}`}
        className={[
          'absolute inset-0 w-full',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
          'hover:bg-surface transition-colors',
        ].join(' ')}
      />

      <div className="pointer-events-none relative flex items-center gap-4 px-5 py-4">
        <PdfIcon />

        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="font-serif text-base font-medium text-text leading-snug truncate">
            {doc.title}
          </span>
          <span className="font-sans text-xs text-text-muted leading-relaxed">
            {doc.filename}
            <span className="mx-1.5 opacity-40">·</span>
            {formatBytes(doc.byteSize)}
            <span className="mx-1.5 opacity-40">·</span>
            {formatDate(doc.importedAt)}
          </span>
        </div>

        {/* Sync badge — warm, reassuring copy; never alarming */}
        {syncState !== undefined && (
          <SyncBadge
            syncState={syncState}
            {...(onRetrySync !== undefined ? { onRetrySync } : {})}
          />
        )}

        {/* Open chevron affordance */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-text-muted opacity-50"
        >
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </li>
  );
}
