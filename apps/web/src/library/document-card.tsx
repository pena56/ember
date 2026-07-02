/**
 * document-card.tsx — one document as a cover-forward tile (the 'grid' view).
 *
 * Same interaction model as DocumentRow: a full-surface "Open {title}" button
 * beneath a pointer-events-none content layer, with tags / overflow menu / retry
 * re-enabling their own pointer events. Shares DocumentItemProps with the row.
 *
 * Token-only styling (invariant #6).
 */

import { formatBytes } from '../store/format-bytes.js';

import { DocumentActions } from './document-actions.js';
import { DocumentCover } from './document-cover.js';
import { formatDocDate, ProgressBar, progressRatio, SyncBadge } from './document-meta.js';
import type { DocumentItemProps } from './document-row.js';
import { DocumentTags } from './document-tags.js';

export function DocumentCard({
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
    <li className="group relative rounded-lg border border-line bg-surface-raised shadow-float-sm transition-shadow hover:shadow-float">
      <button
        type="button"
        onClick={() => { onOpen(doc.id); }}
        aria-label={`Open ${doc.title}`}
        className={[
          'absolute inset-0 w-full rounded-lg',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        ].join(' ')}
      />

      <div className="pointer-events-none relative flex flex-col gap-3 p-3">
        {/* Cover with the overflow menu floated top-right */}
        <div className="relative">
          <DocumentCover docId={doc.id} contentType={doc.contentType} title={doc.title} variant="card" />
          <div className="absolute right-1.5 top-1.5 rounded-sm bg-surface-raised/85 backdrop-blur-sm">
            <DocumentActions
              title={doc.title}
              onDetails={() => { onDetails(doc.id); }}
              onRemove={() => { onRemove(doc.id); }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-0.5">
          <h3 className="line-clamp-2 font-serif text-base font-medium leading-snug text-text">
            {doc.title}
          </h3>
          <p className="font-sans text-xs text-text-muted">
            {formatBytes(doc.byteSize)}
            <span className="mx-1.5 opacity-40">·</span>
            {doc.pageCount !== undefined ? `${doc.pageCount.toString()} pages` : 'PDF'}
            <span className="mx-1.5 opacity-40">·</span>
            {formatDocDate(doc.importedAt)}
          </p>

          {ratio !== null && (
            <div className="flex items-center gap-2 pt-0.5">
              <ProgressBar ratio={ratio} />
              <span className="shrink-0 font-sans text-xs tabular-nums text-text-muted">
                {Math.round(ratio * 100).toString()}%
              </span>
            </div>
          )}

          {hasTagHandlers && (
            <div className="pt-0.5">
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
            </div>
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
