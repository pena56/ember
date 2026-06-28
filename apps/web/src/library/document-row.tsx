import { PlusIcon } from 'lucide-react';

import type { Document, Tag, TagColor } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

import { TagPicker } from './tag-picker.js';
import type { SyncState } from './use-library.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: Document & { syncState?: SyncState };
  onOpen: (id: string) => void;
  /** Called when the user taps "Try again" on an over-quota deferred row. */
  onRetrySync?: () => void;
  // ── Tag props (15b) — optional so existing tests compile without changes ──
  tags?: Tag[];
  /** The doc's resolved (live) tags — already joined against the live tag set. */
  appliedTags?: Tag[];
  onTagDoc?: (tagId: string) => Promise<void>;
  onUntagDoc?: (tagId: string) => Promise<void>;
  onCreateTag?: (name: string, color: TagColor) => Promise<void>;
  onEditTag?: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag?: (tag: Tag) => Promise<void>;
  /** When clicking a tag chip, set the active view to filter by that tag. */
  onTagClick?: (tagId: string) => void;
}

// ── Tag color utility ─────────────────────────────────────────────────────────

const TAG_BG: Record<string, string> = {
  gray:   'bg-tag-gray',
  red:    'bg-tag-red',
  amber:  'bg-tag-amber',
  green:  'bg-tag-green',
  blue:   'bg-tag-blue',
  purple: 'bg-tag-purple',
};

function tagColorClass(color: string): string {
  return TAG_BG[color] ?? TAG_BG['gray']!;
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

// ── Tag chips ─────────────────────────────────────────────────────────────────

/**
 * Tag chip strip — rendered inside the pointer-events-none layer.
 * Each chip's × and the add-tag trigger are pointer-events-auto + stopPropagation
 * so they don't bubble to the full-row open <button> beneath.
 */
function TagChips({
  appliedTags,
  allTags,
  onUntagDoc,
  onTagDoc,
  onCreateTag,
  onEditTag,
  onDeleteTag,
  onTagClick,
}: {
  appliedTags: Tag[];
  allTags: Tag[];
  onUntagDoc: (tagId: string) => Promise<void>;
  onTagDoc: (tagId: string) => Promise<void>;
  onCreateTag: (name: string, color: TagColor) => Promise<void>;
  onEditTag: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag: (tag: Tag) => Promise<void>;
  onTagClick?: (tagId: string) => void;
}) {
  const appliedIds = new Set(appliedTags.map((t) => t.id));

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {appliedTags.map((tag) => (
        <span
          key={tag.id}
          className="pointer-events-auto flex items-center gap-0.5"
        >
          {/* Chip body — primary click sets the active filter view */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTagClick?.(tag.id);
            }}
            className={[
              'flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-xs font-medium text-text leading-tight',
              tagColorClass(tag.color),
              'hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            ].join(' ')}
          >
            {tag.name}
          </button>
          {/* Remove × — independent interactive control */}
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void onUntagDoc(tag.id);
            }}
            className={[
              'pointer-events-auto flex items-center justify-center w-3.5 h-3.5 rounded-full text-text-muted hover:text-text hover:bg-line',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              '-ml-1',
            ].join(' ')}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}

      {/* Add-tag trigger — pointer-events-auto, opens TagPicker */}
      <span className="pointer-events-auto">
        <TagPicker
          tags={allTags}
          appliedTagIds={appliedIds}
          onTagDoc={onTagDoc}
          onUntagDoc={onUntagDoc}
          onCreateTag={onCreateTag}
          onEditTag={onEditTag}
          onDeleteTag={onDeleteTag}
        >
          <button
            type="button"
            aria-label="Add tag"
            onClick={(e) => { e.stopPropagation(); }}
            className={[
              'flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-line text-text-muted',
              'hover:border-accent/50 hover:text-accent transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            ].join(' ')}
          >
            <PlusIcon className="size-3" aria-hidden="true" />
          </button>
        </TagPicker>
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentRow({
  document: doc,
  onOpen,
  onRetrySync,
  tags = [],
  appliedTags = [],
  onTagDoc,
  onUntagDoc,
  onCreateTag,
  onEditTag,
  onDeleteTag,
  onTagClick,
}: DocumentRowProps) {
  const syncState = doc.syncState;
  const hasTagHandlers =
    onTagDoc !== undefined &&
    onUntagDoc !== undefined &&
    onCreateTag !== undefined &&
    onEditTag !== undefined &&
    onDeleteTag !== undefined;

  return (
    <li className="relative">
      {/*
        Full-row open affordance as a base layer. The visible content sits in a
        sibling layer above with pointer-events-none, so the whole row stays
        clickable to open — while interactive tag controls re-enable their own
        pointer events. This avoids nesting an interactive button inside the row
        button (invalid HTML / a11y).
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

      <div className="pointer-events-none relative flex items-start gap-4 px-5 py-4">
        <PdfIcon />

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
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

          {/* Tag chips — only rendered when tag handlers are wired */}
          {hasTagHandlers && (
            <TagChips
              appliedTags={appliedTags}
              allTags={tags}
              onTagDoc={onTagDoc!}
              onUntagDoc={onUntagDoc!}
              onCreateTag={onCreateTag!}
              onEditTag={onEditTag!}
              onDeleteTag={onDeleteTag!}
              {...(onTagClick !== undefined ? { onTagClick } : {})}
            />
          )}
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
          className="shrink-0 text-text-muted opacity-50 mt-0.5"
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
