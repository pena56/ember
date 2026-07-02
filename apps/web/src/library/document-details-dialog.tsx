/**
 * document-details-dialog.tsx — properties view for a single document.
 *
 * Read-only summary of everything Ember knows about a PDF: title, file, size,
 * pages, when it was added, sync status, reading progress, tags, and the content
 * hash that is its identity. Opened from the row/card overflow menu.
 *
 * Token-only styling (invariant #6). No fake values — fields that are unknown
 * (e.g. pageCount before first open) render as "—" (invariant #1).
 */

import type { ReactNode } from 'react';

import type { Tag } from '@ember/core';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';

import { formatBytes } from '../store/format-bytes.js';

import { formatDocDate, progressRatio } from './document-meta.js';
import type { DocumentWithSync } from './use-library.js';

const SYNC_LABEL: Record<DocumentWithSync['syncState'], string> = {
  synced: 'Synced across your devices',
  pending: 'Syncing…',
  'over-file-cap': 'Too large to sync — kept on this device',
  'over-quota': 'Storage full — kept on this device',
};

interface DocumentDetailsDialogProps {
  doc: DocumentWithSync | null;
  tags: Tag[];
  position: { page: number } | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5">
      <dt className="font-sans text-xs text-text-muted">{label}</dt>
      <dd className="font-sans text-sm text-text break-words">{children}</dd>
    </div>
  );
}

export function DocumentDetailsDialog({
  doc,
  tags,
  position,
  open,
  onOpenChange,
}: DocumentDetailsDialogProps) {
  if (doc === null) return null;

  const ratio = progressRatio(position?.page, doc.pageCount);
  const progressText =
    position === undefined
      ? 'Not started'
      : doc.pageCount !== undefined
        ? `Page ${position.page.toString()} of ${doc.pageCount.toString()} · ${Math.round((ratio ?? 0) * 100).toString()}%`
        : `Page ${position.page.toString()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl leading-snug text-balance">
            {doc.title}
          </DialogTitle>
          <DialogDescription className="font-sans text-sm text-text-muted">
            Document details
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-line">
          <Field label="File name">{doc.filename}</Field>
          <Field label="Size">{formatBytes(doc.byteSize)}</Field>
          <Field label="Pages">{doc.pageCount?.toString() ?? '—'}</Field>
          <Field label="Reading progress">{progressText}</Field>
          <Field label="Added">{formatDocDate(doc.importedAt)}</Field>
          <Field label="Sync">{SYNC_LABEL[doc.syncState]}</Field>
          <Field label="Tags">
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-surface px-2 py-0.5 font-sans text-xs text-text-muted"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Content ID (SHA-256)">
            <span className="font-mono text-xs text-text-muted break-all">{doc.id}</span>
          </Field>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
