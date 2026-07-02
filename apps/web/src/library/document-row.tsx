/**
 * document-row.tsx — one document as a list row (the 'list' view).
 *
 * A full-surface "Open {title}" button sits beneath a pointer-events-none content
 * layer; the interactive controls (tags, overflow menu, retry) re-enable their own
 * pointer events. This keeps the whole row clickable to open without nesting
 * interactive elements inside a button (invalid HTML / a11y).
 *
 * Token-only styling (invariant #6).
 */

import type { Document, Tag, TagColor } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

import { DocumentActions } from './document-actions.js';
import { DocumentCover } from './document-cover.js';
import { formatDocDate, ProgressBar, progressRatio, SyncBadge } from './document-meta.js';
import { DocumentTags } from './document-tags.js';
import type { SyncState } from './use-library.js';

export interface DocumentItemProps {
  document: Document & { syncState?: SyncState };
  onOpen: (id: string) => void;
  onDetails: (id: string) => void;
  onRemove: (id: string) => void;
  onRetrySync?: () => void;
  position?: { page: number };
  tags?: Tag[];
  appliedTags?: Tag[];
  onTagDoc?: (tagId: string) => Promise<void>;
  onUntagDoc?: (tagId: string) => Promise<void>;
  onCreateTag?: (name: string, color: TagColor) => Promise<void>;
  onEditTag?: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag?: (tag: Tag) => Promise<void>;
  onTagClick?: (tagId: string) => void;
}

export function DocumentRow({
  document: doc,
  onOpen,
  onDetails,
  onRemove,
  onRetrySync,
  position,
  tags = [],
  appliedTags = [],
  onTagDoc,
  onUntagDoc,
  onCreateTag,
  onEditTag,
  onDeleteTag,
  onTagClick,
}: DocumentItemProps) {
  const syncState = doc.syncState;
  const ratio = progressRatio(position?.page, doc.pageCount);
  const hasTagHandlers =
    onTagDoc !== undefined &&
    onUntagDoc !== undefined &&
    onCreateTag !== undefined &&
    onEditTag !== undefined &&
    onDeleteTag !== undefined;

  return (
    <li className="relative">
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

      <div className="pointer-events-none relative flex items-start gap-4 px-4 py-3.5">
        <DocumentCover docId={doc.id} contentType={doc.contentType} title={doc.title} variant="thumb" />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-serif text-base font-medium leading-snug text-text">
                {doc.title}
              </span>
              <span className="font-sans text-xs leading-relaxed text-text-muted">
                {formatBytes(doc.byteSize)}
                <span className="mx-1.5 opacity-40">·</span>
                {doc.pageCount !== undefined ? `${doc.pageCount.toString()} pages` : 'PDF'}
                <span className="mx-1.5 opacity-40">·</span>
                {formatDocDate(doc.importedAt)}
              </span>
            </div>

            <DocumentActions
              title={doc.title}
              onDetails={() => { onDetails(doc.id); }}
              onRemove={() => { onRemove(doc.id); }}
            />
          </div>

          {ratio !== null && (
            <div className="flex items-center gap-2 pr-8">
              <ProgressBar ratio={ratio} />
              <span className="shrink-0 font-sans text-xs tabular-nums text-text-muted">
                {Math.round(ratio * 100).toString()}%
              </span>
            </div>
          )}

          {hasTagHandlers && (
            <DocumentTags
              appliedTags={appliedTags}
              allTags={tags}
              onTagDoc={onTagDoc}
              onUntagDoc={onUntagDoc}
              onCreateTag={onCreateTag}
              onEditTag={onEditTag}
              onDeleteTag={onDeleteTag}
              {...(onTagClick !== undefined ? { onTagClick } : {})}
            />
          )}

          {syncState !== undefined && (
            <SyncBadge
              syncState={syncState}
              {...(onRetrySync !== undefined ? { onRetrySync } : {})}
            />
          )}
        </div>
      </div>
    </li>
  );
}
