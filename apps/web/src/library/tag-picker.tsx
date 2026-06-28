/**
 * tag-picker.tsx — Popover + Command combobox for tagging a document.
 *
 * - Search / list existing tags (dedupe display via tagDedupeKey).
 * - Toggle each on/off for the doc (tagDoc / untagDoc).
 * - Create a new tag inline when the typed name has no dedupe match.
 * - Per-tag overflow menu: rename, recolor (editTag), delete (deleteTag, confirm).
 *
 * Invariant #6: tag color chips use bg-tag-* utilities from --color-tag-* tokens.
 * Row interaction pattern: rendered inside pointer-events-none layer; caller wraps
 * with pointer-events-auto + stopPropagation.
 */

import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';

import type { Tag } from '@ember/core';
import { DEFAULT_TAG_COLOR, TAG_COLORS, TagColor, tagDedupeKey } from '@ember/core';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../components/ui/command.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js';

// ── Tag color → Tailwind class ────────────────────────────────────────────────

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

// ── Color swatch row ──────────────────────────────────────────────────────────

function ColorSwatches({
  selected,
  onSelect,
}: {
  selected: TagColor;
  onSelect: (c: TagColor) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1 px-2" role="group" aria-label="Pick a color">
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color: ${c}`}
          aria-pressed={c === selected}
          onClick={() => { onSelect(c); }}
          className={[
            'w-5 h-5 rounded-full transition-transform',
            tagColorClass(c),
            c === selected ? 'ring-2 ring-offset-1 ring-accent scale-110' : 'hover:scale-110',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

// ── Tag item row ──────────────────────────────────────────────────────────────

function TagRow({
  tag,
  checked,
  onToggle,
  onRename,
  onRecolor,
  onDelete,
}: {
  tag: Tag;
  checked: boolean;
  onToggle: () => void;
  onRename: () => void;
  onRecolor: (color: TagColor) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 px-1">
      <CommandItem
        onSelect={onToggle}
        selected={checked}
        className="flex-1 min-w-0"
        aria-label={tag.name}
      >
        <span
          className={[
            'flex-shrink-0 w-2.5 h-2.5 rounded-full',
            tagColorClass(tag.color),
          ].join(' ')}
          aria-hidden="true"
        />
        <span className="flex-1 truncate">{tag.name}</span>
        {checked && <CheckIcon className="size-3.5 shrink-0 text-accent" aria-hidden="true" />}
      </CommandItem>

      {/* Per-tag overflow menu — separate from the toggle item */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${tag.name}`}
            onClick={(e) => { e.stopPropagation(); }}
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="2" cy="6" r="1.2" fill="currentColor" />
              <circle cx="6" cy="6" r="1.2" fill="currentColor" />
              <circle cx="10" cy="6" r="1.2" fill="currentColor" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onRename} className="gap-2">
            <PencilIcon className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <div className="px-1 py-1">
            <p className="px-2 pb-1 font-sans text-xs text-text-muted">Color</p>
            <ColorSwatches selected={tag.color} onSelect={onRecolor} />
          </div>
          <DropdownMenuItem
            onSelect={onDelete}
            className="gap-2 text-red-600 focus:text-red-600"
          >
            <Trash2Icon className="size-3.5" />
            Delete tag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Rename inline input ───────────────────────────────────────────────────────

function RenameInput({
  tag,
  onConfirm,
  onCancel,
}: {
  tag: Tag;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(tag.name);
  const trimmed = value.trim();
  const invalid = trimmed.length === 0;

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !invalid) { onConfirm(trimmed); }
          if (e.key === 'Escape') { onCancel(); }
        }}
        className="flex-1 rounded border border-line bg-surface px-2 py-1 font-sans text-sm text-text outline-none focus:ring-2 focus:ring-accent/30 min-w-0"
        aria-label="Rename tag"
      />
      <button
        type="button"
        disabled={invalid}
        onClick={() => { if (!invalid) onConfirm(trimmed); }}
        className="flex-shrink-0 rounded px-2 py-1 font-sans text-xs bg-accent text-on-accent disabled:opacity-40"
        aria-label="Confirm rename"
      >
        OK
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex-shrink-0 rounded px-1 py-1 text-text-muted hover:text-text"
        aria-label="Cancel rename"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TagPickerProps {
  /** All known tags (global list). */
  tags: Tag[];
  /** Ids of tags currently applied to this document. */
  appliedTagIds: Set<string>;
  /** Trigger element — typically the "add tag" button from a document row. */
  children: React.ReactNode;
  onTagDoc: (tagId: string) => Promise<void>;
  onUntagDoc: (tagId: string) => Promise<void>;
  onCreateTag: (name: string, color: TagColor) => Promise<void>;
  onEditTag: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag: (tag: Tag) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TagPicker({
  tags,
  appliedTagIds,
  children,
  onTagDoc,
  onUntagDoc,
  onCreateTag,
  onEditTag,
  onDeleteTag,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  const queryKey = tagDedupeKey(query);

  // Filtered tags — dedupe by key, then filter by query
  const filteredTags = query.length === 0
    ? tags
    : tags.filter((t) => tagDedupeKey(t.name).includes(queryKey));

  // Does the typed name match an existing tag (dedupe-key equality)?
  const exactMatch = tags.find((t) => tagDedupeKey(t.name) === queryKey);
  const canCreate = query.trim().length > 0 && exactMatch === undefined;

  async function handleToggle(tag: Tag) {
    if (appliedTagIds.has(tag.id)) {
      await onUntagDoc(tag.id);
    } else {
      await onTagDoc(tag.id);
    }
  }

  async function handleCreate() {
    if (!canCreate) return;
    await onCreateTag(query.trim(), DEFAULT_TAG_COLOR);
    setQuery('');
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          className="w-64 p-0"
          align="start"
          onInteractOutside={() => { setQuery(''); setRenamingId(null); }}
        >
          <Command>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Find or create a tag…"
              aria-label="Search tags"
            />
            <CommandList>
              {filteredTags.length === 0 && !canCreate && (
                <CommandEmpty>No matching tags.</CommandEmpty>
              )}

              {filteredTags.map((tag) => (
                <div key={tag.id}>
                  {renamingId === tag.id ? (
                    <RenameInput
                      tag={tag}
                      onConfirm={async (name) => {
                        await onEditTag(tag, { name });
                        setRenamingId(null);
                      }}
                      onCancel={() => { setRenamingId(null); }}
                    />
                  ) : (
                    <TagRow
                      tag={tag}
                      checked={appliedTagIds.has(tag.id)}
                      onToggle={() => { void handleToggle(tag); }}
                      onRename={() => { setRenamingId(tag.id); }}
                      onRecolor={(color) => { void onEditTag(tag, { color }); }}
                      onDelete={() => { setDeleteTarget(tag); }}
                    />
                  )}
                </div>
              ))}

              {canCreate && (
                <>
                  {filteredTags.length > 0 && <CommandSeparator />}
                  <CommandItem
                    onSelect={() => { void handleCreate(); }}
                    className="gap-2 text-accent"
                    aria-label={`Create tag "${query.trim()}"`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
                      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Create &ldquo;{query.trim()}&rdquo;
                  </CommandItem>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Delete confirm — outside Popover so it doesn't close when Popover unmounts */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget !== null
                ? `"${deleteTarget.name}" will be removed from all books. This can't be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteTarget(null); }}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget !== null) {
                  await onDeleteTag(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
