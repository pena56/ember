/**
 * duplicate-prompt.tsx — inline card surfacing a near-duplicate pair.
 *
 * Pure presentational — no store access. All logic lives in useDuplicates().
 * Renders above the document list (below the dropzone) when `pair` is defined.
 *
 * Design: soft surface.raised card with hairline border, Fraunces title,
 * side-by-side copy metadata, Merge accent CTA (on-accent ink), keep-which
 * radio group, Keep both ghost button, Not now quiet text button.
 * Invariant #6: token-only, no hardcoded palette.
 */

import { useState } from 'react';

import type { Document, DuplicatePair } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DuplicatePromptProps {
  pair: DuplicatePair;
  docs: { a: Document; b: Document };
  defaultCanonicalId: string;
  onMerge: (canonicalId: string) => void;
  onKeepSeparate: () => void;
  onDismiss: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

// ── Copy card for one document in the pair ────────────────────────────────────

interface CopyCardProps {
  doc: Document;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

function CopyCard({ doc, label, selected, onSelect }: CopyCardProps) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-label={`Keep ${label}: ${doc.title}`}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        // ≥44px hit target (spec §A11y)
        'min-h-[44px] flex flex-col gap-1.5 rounded-lg border p-4 cursor-pointer select-none',
        'transition-colors',
        // Focus ring: accent (invariant #6)
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected
          ? 'border-accent bg-accent/10'
          : 'border-line bg-surface hover:border-accent/40 hover:bg-surface-raised',
      ].join(' ')}
    >
      {/* Selected indicator */}
      <div className="flex items-center gap-2">
        <span
          className={[
            'flex-none w-4 h-4 rounded-full border-2 transition-colors',
            selected ? 'border-accent bg-accent' : 'border-line bg-surface',
          ].join(' ')}
          aria-hidden="true"
        />
        <span
          className={[
            'font-sans text-xs font-medium uppercase tracking-wide',
            selected ? 'text-accent' : 'text-text-muted',
          ].join(' ')}
        >
          {selected ? 'Keep this one' : label}
        </span>
      </div>

      {/* Book details */}
      <p className="font-serif text-sm font-medium text-text leading-snug truncate">
        {doc.title}
      </p>
      <p className="font-sans text-xs text-text-muted leading-relaxed truncate">
        {doc.filename}
      </p>
      <p className="font-sans text-xs text-text-muted">
        {formatBytes(doc.byteSize)}
        <span className="mx-1.5 opacity-40">·</span>
        Added {formatDate(doc.importedAt)}
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DuplicatePrompt({
  docs,
  defaultCanonicalId,
  onMerge,
  onKeepSeparate,
  onDismiss,
}: DuplicatePromptProps) {
  const [selectedCanonicalId, setSelectedCanonicalId] = useState(defaultCanonicalId);

  return (
    <section
      aria-label="Possible duplicate book"
      className={[
        // surface.raised card with hairline — token-only (invariant #6)
        'rounded-xl border border-line bg-surface-raised',
        'flex flex-col gap-4 p-5',
        // Motion-safe entrance
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200',
      ].join(' ')}
    >
      {/* Title */}
      <h3 className="font-serif text-lg font-semibold text-text leading-snug">
        This looks like a book you already have
      </h3>

      {/* Body — muted, calm */}
      <p className="font-sans text-sm text-text-muted">
        We found two copies that look similar. Choose which one to keep — the other will be hidden
        (not deleted). You can always undo this later.
      </p>

      {/* Side-by-side copy selector (radio group) */}
      <div
        role="radiogroup"
        aria-label="Which copy to keep"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <CopyCard
          doc={docs.a}
          label="Copy A"
          selected={selectedCanonicalId === docs.a.id}
          onSelect={() => { setSelectedCanonicalId(docs.a.id); }}
        />
        <CopyCard
          doc={docs.b}
          label="Copy B"
          selected={selectedCanonicalId === docs.b.id}
          onSelect={() => { setSelectedCanonicalId(docs.b.id); }}
        />
      </div>

      {/* Merge hint */}
      <p className="font-sans text-xs text-text-muted">
        Keep the larger copy, hide the other. Merge is reversible.
      </p>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Merge — accent CTA, on-accent ink (invariant #6: never white-on-amber) */}
        <button
          type="button"
          onClick={() => { onMerge(selectedCanonicalId); }}
          className={[
            // ≥44px hit target
            'min-h-[44px] inline-flex items-center justify-center px-5 rounded-lg',
            'font-sans text-sm font-semibold',
            // Accent background, on-accent ink (token-only)
            'bg-accent text-on-accent',
            'hover:bg-accent/90 transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ].join(' ')}
        >
          Merge
        </button>

        {/* Keep both — ghost/outline */}
        <button
          type="button"
          onClick={onKeepSeparate}
          className={[
            'min-h-[44px] inline-flex items-center justify-center px-5 rounded-lg',
            'font-sans text-sm font-medium',
            'border border-line bg-surface text-text',
            'hover:bg-surface-raised hover:border-accent/40 transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ].join(' ')}
        >
          Keep both
        </button>

        {/* Not now — quiet text */}
        <button
          type="button"
          onClick={onDismiss}
          className={[
            'min-h-[44px] inline-flex items-center justify-center px-3 rounded-lg',
            'font-sans text-sm text-text-muted',
            'hover:text-text transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ].join(' ')}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
