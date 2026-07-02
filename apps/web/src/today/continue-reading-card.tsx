/**
 * continue-reading-card.tsx — the "Continue Reading" card on the Today page.
 *
 * Shows the most-recently-read book (title + page), with a Resume button.
 * Empty state shows a gentle nudge — quiet voice, no guilt-tripping (brand invariant).
 *
 * Design: a soft floating card over the ambient backdrop — Fraunces title that
 * breathes, generous whitespace, the Resume action given real weight. No side
 * stripe, no uppercase eyebrow. Token-driven (invariant #6); builds on the
 * shadcn Button primitive.
 */

import { NavLink } from 'react-router';

import { Button } from '@/components/ui/button.js';

import type { ContinueReadingItem } from './select-continue-reading.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContinueReadingCardProps {
  item: ContinueReadingItem | undefined;
  onResume: (docId: string) => void;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface-raised shadow-float-sm">
      {/* Faint ember glow in the corner — atmosphere, echoing the ambient field */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent opacity-[0.06]"
        aria-hidden="true"
      />

      <div className="relative flex flex-col items-center gap-6 px-8 py-12 text-center">
        {/* Ember flame — dimmed, waiting */}
        <svg
          width="44"
          height="52"
          viewBox="0 0 44 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="text-accent opacity-25"
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

        <div className="flex max-w-[24ch] flex-col gap-2">
          <p className="font-serif text-xl leading-snug text-text">
            Your next chapter awaits.
          </p>
          <p className="font-sans text-sm leading-relaxed text-text-muted">
            Nothing open yet — pick a book from your library to begin.
          </p>
        </div>

        <NavLink
          to="/library"
          className={[
            'inline-flex items-center gap-2 font-sans text-sm font-medium',
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

// ── Card ──────────────────────────────────────────────────────────────────────

export function ContinueReadingCard({ item, onResume }: ContinueReadingCardProps) {
  if (!item) {
    return <EmptyState />;
  }

  return (
    <div className="rounded-lg border border-line bg-surface-raised shadow-float">
      <div className="flex flex-col gap-6 px-7 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        {/* Book */}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-sans text-sm text-text-muted">Continue reading</p>
          <h2 className="font-serif text-2xl font-semibold leading-tight text-text text-balance">
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
    </div>
  );
}
