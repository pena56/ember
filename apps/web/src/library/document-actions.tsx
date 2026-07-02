/**
 * document-actions.tsx — the per-document overflow menu (Details / Remove).
 *
 * Shared by the list row and grid card. Sits in the pointer-events-auto layer so
 * it stays clickable above the item's full-surface "Open" button; the trigger
 * stops propagation so opening the menu never opens the document.
 *
 * Token-only styling (invariant #6).
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';

interface DocumentActionsProps {
  title: string;
  onDetails: () => void;
  onRemove: () => void;
}

export function DocumentActions({ title, onDetails, onRemove }: DocumentActionsProps) {
  return (
    <span className="pointer-events-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${title}`}
            onClick={(e) => { e.stopPropagation(); }}
            className={[
              'flex items-center justify-center size-7 rounded-sm text-text-muted',
              'hover:bg-surface hover:text-text transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            ].join(' ')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="3" r="1.4" fill="currentColor" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <circle cx="8" cy="13" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-sm">
          <DropdownMenuItem onSelect={onDetails} className="rounded-sm">
            Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onRemove}
            className="rounded-sm text-red-600 focus:text-red-600"
          >
            Remove from library
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
