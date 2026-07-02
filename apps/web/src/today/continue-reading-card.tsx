/**
 * continue-reading-card.tsx — the "Continue Reading" band of the Today hero panel.
 *
 * Shows the most-recently-read book (title + page) with a Resume button. Empty
 * state is a gentle nudge — quiet voice, no guilt-tripping (brand invariant).
 *
 * Renders as a band *inside* the shared Today panel (no card chrome of its own),
 * so the greeting, this invitation, and the habit band read as one composition.
 * Token-driven (invariant #6); builds on the shadcn Button primitive.
 */

import { NavLink } from 'react-router';

import { Button } from '@/components/ui/button.js';

import type { ContinueReadingItem } from './select-continue-reading.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContinueReadingSectionProps {
  item: ContinueReadingItem | undefined;
  loading: boolean;
  onResume: (docId: string) => void;
}

// ── Loading skeleton ────────────────────────────────────────────────────────────

function LoadingBand() {
  return (
    <div
      className="flex items-center justify-between gap-8"
      role="status"
      aria-label="Loading your reading progress"
    >
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
        <div className="h-6 w-48 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
        <div className="h-3 w-16 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
      </div>
      <div className="h-9 w-24 rounded-sm bg-line motion-safe:animate-pulse" aria-hidden="true" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyBand() {
  return (
    <div className="flex items-center gap-5">
      {/* Ember flame — dimmed, waiting */}
      <svg
        width="36"
        height="44"
        viewBox="0 0 44 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 text-accent opacity-25"
      >
        <path
          d="M22 2C22 2 6 18 6 32C6 41.941 13.163 50 22 50C30.837 50 38 41.941 38 32C38 22 30 14 27 8C27 8 26 20 22 23C18 20 22 2 22 2Z"
          fill="currentColor"
        />
        <path
          d="M22 23C22 23 14 31 14 37C14 41.418 17.582 45 22 45C26.418 45 30 41.418 30 37C30 31 22 23 22 23Z"
          fill="currentColor"
          fillOpacity="0.4"
        />
      </svg>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-serif text-lg leading-snug text-text">
          Your next chapter awaits.
        </p>
        <p className="font-sans text-sm leading-relaxed text-text-muted">
          Nothing open yet — pick a book from your library to begin.
        </p>
        <NavLink
          to="/library"
          className={[
            'mt-1 inline-flex items-center gap-1.5 font-sans text-sm font-medium',
            'text-accent underline-offset-4 hover:underline',
            'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'transition-colors',
          ].join(' ')}
        >
          Browse your library
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavLink>
      </div>
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────────

export function ContinueReadingSection({ item, loading, onResume }: ContinueReadingSectionProps) {
  if (loading) return <LoadingBand />;
  if (!item) return <EmptyBand />;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      {/* Book */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-sans text-xs font-medium text-text-muted">Continue reading</p>
        <h2 className="truncate font-serif text-2xl font-semibold leading-tight text-text text-balance">
          {item.title}
        </h2>
        <p className="font-sans text-sm text-text-muted">
          Page {item.page}
        </p>
      </div>

      {/* Resume action */}
      <div className="flex-shrink-0">
        <Button
          onClick={() => { onResume(item.docId); }}
          className="h-9 rounded-sm px-5 font-sans text-sm font-medium"
        >
          Resume
        </Button>
      </div>
    </div>
  );
}
