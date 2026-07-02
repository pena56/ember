/**
 * document-tags.tsx — the tag chip strip shared by the list row and grid card.
 *
 * Each chip filters the library by that tag on click; its × untags the doc. The
 * add-tag trigger opens the TagPicker (create / edit / recolor / delete). All
 * controls are pointer-events-auto + stopPropagation so they never bubble to the
 * item's full-surface "Open" button beneath them (avoids nested-button a11y bugs).
 *
 * Token-only styling (invariant #6 — tag colors from --color-tag-* tokens).
 */

import { PlusIcon } from 'lucide-react';

import type { Tag, TagColor } from '@ember/core';

import { TagPicker } from './tag-picker.js';

const TAG_BG: Record<string, string> = {
  gray: 'bg-tag-gray',
  red: 'bg-tag-red',
  amber: 'bg-tag-amber',
  green: 'bg-tag-green',
  blue: 'bg-tag-blue',
  purple: 'bg-tag-purple',
};

function tagColorClass(color: string): string {
  return TAG_BG[color] ?? TAG_BG['gray']!;
}

export interface DocumentTagsProps {
  appliedTags: Tag[];
  allTags: Tag[];
  onTagDoc: (tagId: string) => Promise<void>;
  onUntagDoc: (tagId: string) => Promise<void>;
  onCreateTag: (name: string, color: TagColor) => Promise<void>;
  onEditTag: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag: (tag: Tag) => Promise<void>;
  onTagClick?: (tagId: string) => void;
}

export function DocumentTags({
  appliedTags,
  allTags,
  onUntagDoc,
  onTagDoc,
  onCreateTag,
  onEditTag,
  onDeleteTag,
  onTagClick,
}: DocumentTagsProps) {
  const appliedIds = new Set(appliedTags.map((t) => t.id));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {appliedTags.map((tag) => (
        <span key={tag.id} className="pointer-events-auto flex items-center gap-0.5">
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
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void onUntagDoc(tag.id);
            }}
            className={[
              'pointer-events-auto flex items-center justify-center w-3.5 h-3.5 rounded-full text-text-muted hover:text-text hover:bg-line',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent -ml-1',
            ].join(' ')}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}

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
