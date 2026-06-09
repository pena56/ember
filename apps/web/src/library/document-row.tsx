import type { Document } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: Document;
  onOpen: (id: string) => void;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentRow({ document: doc, onOpen }: DocumentRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => { onOpen(doc.id); }}
        aria-label={`Open ${doc.title}`}
        className={[
          'w-full flex items-center gap-4 px-5 py-4 text-left',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
          'hover:bg-surface transition-colors',
        ].join(' ')}
      >
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
      </button>
    </li>
  );
}
