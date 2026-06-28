/**
 * smart-view-bar.tsx — horizontal pill row above the document list.
 *
 * Renders BUILT_IN_SMART_VIEWS then saved views; active pill is accent-filled.
 * Saved-view pills carry a small DropdownMenu (rename / delete with AlertDialog confirm).
 * A "Save view" affordance appears when the active query is an ad-hoc tag filter
 * not already saved → opens a name dialog → createSmartView.
 *
 * Invariant #5: pills just call setActiveView; filtering is evaluateSmartView's job.
 * Invariant #6: colors from tokens, not hardcoded.
 */

import { useState } from 'react';

import type { SmartView, SmartViewQuery } from '@ember/core';
import { BUILT_IN_SMART_VIEWS } from '@ember/core';

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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';

import type { ActiveView } from './use-library-tags.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SmartViewBarProps {
  smartViews: SmartView[];
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  /** Whether the current active query is ad-hoc (not saved) and has tag filters. */
  isAdHocTagFilter: boolean;
  onRenameView: (view: SmartView, newName: string) => Promise<void>;
  onDeleteView: (view: SmartView) => Promise<void>;
  onSaveView: (name: string) => Promise<void>;
}

// ── Pill ──────────────────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'shrink-0 rounded-full px-3 py-1 font-sans text-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        active
          ? 'bg-accent text-on-accent font-medium'
          : 'bg-surface-raised text-text-muted border border-line hover:border-accent/40 hover:text-text',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Saved view pill with menu ─────────────────────────────────────────────────

function SavedViewPill({
  view,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  view: SmartView;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="relative flex items-center shrink-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={[
          'rounded-full pl-3 pr-7 py-1 font-sans text-sm transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          active
            ? 'bg-accent text-on-accent font-medium'
            : 'bg-surface-raised text-text-muted border border-line hover:border-accent/40 hover:text-text',
        ].join(' ')}
      >
        {view.name}
      </button>
      {/* Overflow menu — pointer-events-auto on a separate element, not nested button */}
      <span className="pointer-events-auto absolute right-1 flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Options for ${view.name}`}
              onClick={(e) => { e.stopPropagation(); }}
              className={[
                'flex items-center justify-center w-5 h-5 rounded-full',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                active ? 'text-on-accent/70 hover:text-on-accent' : 'text-text-muted hover:text-text',
              ].join(' ')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="2" cy="6" r="1.2" fill="currentColor" />
                <circle cx="6" cy="6" r="1.2" fill="currentColor" />
                <circle cx="10" cy="6" r="1.2" fill="currentColor" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-red-600 focus:text-red-600"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </span>
  );
}

// ── Rename dialog ─────────────────────────────────────────────────────────────

function RenameDialog({
  view,
  open,
  onClose,
  onConfirm,
}: {
  view: SmartView | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const invalid = trimmed.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { onClose(); setName(''); }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Rename view</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={name}
            placeholder={view?.name ?? ''}
            onChange={(e) => { setName(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !invalid) {
                onConfirm(trimmed);
                setName('');
              }
            }}
            className={[
              'rounded-md border bg-surface-raised px-3 py-2 font-sans text-sm text-text placeholder:text-text-muted outline-none',
              'focus:ring-2 focus:ring-accent/30 transition-shadow',
              invalid && name.length > 0 ? 'border-red-400' : 'border-line',
            ].join(' ')}
          />
          {invalid && name.length > 0 && (
            <p className="font-sans text-xs text-red-500">
              Name can't be empty.
            </p>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => { onClose(); setName(''); }}
            className="rounded-md border border-line px-3 py-1.5 font-sans text-sm text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => { onConfirm(trimmed); setName(''); }}
            className="rounded-md bg-accent px-3 py-1.5 font-sans text-sm text-on-accent font-medium disabled:opacity-40 transition-opacity"
          >
            Rename
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Save view dialog ──────────────────────────────────────────────────────────

function SaveViewDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const invalid = trimmed.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { onClose(); setName(''); }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Save this view</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="font-sans text-sm text-text-muted">
            Give this tag filter a name so you can return to it anytime.
          </p>
          <input
            type="text"
            value={name}
            placeholder="e.g. Science Fiction"
            onChange={(e) => { setName(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !invalid) {
                onConfirm(trimmed);
                setName('');
              }
            }}
            className={[
              'rounded-md border bg-surface-raised px-3 py-2 font-sans text-sm text-text placeholder:text-text-muted outline-none',
              'focus:ring-2 focus:ring-accent/30 transition-shadow',
              invalid && name.length > 0 ? 'border-red-400' : 'border-line',
            ].join(' ')}
          />
          {invalid && name.length > 0 && (
            <p className="font-sans text-xs text-red-500">
              Name can't be empty.
            </p>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => { onClose(); setName(''); }}
            className="rounded-md border border-line px-3 py-1.5 font-sans text-sm text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => { onConfirm(trimmed); setName(''); }}
            className="rounded-md bg-accent px-3 py-1.5 font-sans text-sm text-on-accent font-medium disabled:opacity-40 transition-opacity"
          >
            Save view
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  view,
  open,
  onClose,
  onConfirm,
}: {
  view: SmartView | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this view?</AlertDialogTitle>
          <AlertDialogDescription>
            {view !== null
              ? `"${view.name}" will be removed. Books tagged within it are untouched.`
              : 'This view will be removed.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Main bar ──────────────────────────────────────────────────────────────────

export function SmartViewBar({
  smartViews,
  activeView,
  onSelectView,
  isAdHocTagFilter,
  onRenameView,
  onDeleteView,
  onSaveView,
}: SmartViewBarProps) {
  const [renameTarget, setRenameTarget] = useState<SmartView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmartView | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  function isBuiltinActive(key: string) {
    return activeView.kind === 'builtin' && activeView.key === key;
  }

  function isSavedActive(id: string) {
    return activeView.kind === 'saved' && activeView.id === id;
  }

  return (
    <>
      <nav
        aria-label="Filter views"
        className="flex flex-wrap gap-2 pb-1"
      >
        {/* Built-in pills */}
        {BUILT_IN_SMART_VIEWS.map((bv) => (
          <Pill
            key={bv.key}
            label={bv.name}
            active={isBuiltinActive(bv.key)}
            onClick={() => {
              onSelectView({ kind: 'builtin', key: bv.key, query: bv.query });
            }}
          />
        ))}

        {/* Saved-view pills */}
        {smartViews.map((sv) => (
          <SavedViewPill
            key={sv.id}
            view={sv}
            active={isSavedActive(sv.id)}
            onSelect={() => {
              onSelectView({ kind: 'saved', id: sv.id, query: sv.query });
            }}
            onRename={() => { setRenameTarget(sv); }}
            onDelete={() => { setDeleteTarget(sv); }}
          />
        ))}

        {/* Save current filter — only shown for unsaved ad-hoc tag queries */}
        {isAdHocTagFilter && (
          <button
            type="button"
            onClick={() => { setSaveOpen(true); }}
            className={[
              'shrink-0 flex items-center gap-1 rounded-full border border-dashed border-accent/50 px-3 py-1',
              'font-sans text-sm text-accent hover:border-accent hover:bg-accent/5 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            ].join(' ')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Save view
          </button>
        )}
      </nav>

      {/* Dialogs */}
      <RenameDialog
        view={renameTarget}
        open={renameTarget !== null}
        onClose={() => { setRenameTarget(null); }}
        onConfirm={async (name) => {
          if (renameTarget !== null) {
            await onRenameView(renameTarget, name);
            setRenameTarget(null);
          }
        }}
      />

      <DeleteConfirmDialog
        view={deleteTarget}
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); }}
        onConfirm={async () => {
          if (deleteTarget !== null) {
            await onDeleteView(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />

      <SaveViewDialog
        open={saveOpen}
        onClose={() => { setSaveOpen(false); }}
        onConfirm={async (name) => {
          await onSaveView(name);
          setSaveOpen(false);
        }}
      />
    </>
  );
}

// ── Helper: detect ad-hoc tag filter (not a builtin, has tagIds) ─────────────

export function isAdHocTagFilter(
  activeView: ActiveView,
  query: SmartViewQuery,
): boolean {
  if (activeView.kind !== 'builtin') return false;
  // A builtin with tagIds is an ad-hoc filter set by clicking a tag chip
  return Array.isArray(query.tagIds) && query.tagIds.length > 0;
}
