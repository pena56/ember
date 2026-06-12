/**
 * continue-reading-card.tsx — the "Continue Reading" card on the Today page.
 *
 * Shows the most-recently-read book (title + page), with a Resume button.
 * Empty state shows a gentle nudge — quiet voice, no guilt-tripping (brand invariant).
 *
 * Design: bookmarked-page aesthetic — left accent stripe (ember color), Fraunces
 * title that breathes, generous whitespace. Token-driven (invariant #6).
 * Builds on shadcn Card + Button primitives per ui-context.
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
    <div className="relative rounded-2xl bg-surface-raised border border-line overflow-hidden">
      {/* Subtle decorative accent — faint ember glow in corner */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-accent opacity-5 pointer-events-none"
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

        <div className="flex flex-col gap-2 max-w-[22ch]">
          <p className="font-serif text-xl text-text leading-snug">
            Your next chapter awaits.
          </p>
          <p className="font-sans text-sm text-text-muted leading-relaxed">
            Nothing open yet — pick a book from your library to begin.
          </p>
        </div>

        <NavLink
          to="/library"
          className={[
            'inline-flex items-center gap-2 font-sans text-sm font-medium',
            'text-accent underline-offset-4 hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded',
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
    <div className="relative rounded-2xl bg-surface-raised border border-line overflow-hidden group">
      {/* Left bookmark stripe — the ember accent mark */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-l-2xl"
        aria-hidden="true"
      />

      {/* Subtle glow behind the stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-12 opacity-[0.04] pointer-events-none"
        style={{
          background: 'linear-gradient(to right, var(--color-accent), transparent)',
        }}
        aria-hidden="true"
      />

      <div className="relative pl-8 pr-6 pt-6 pb-6 flex flex-col gap-5">
        {/* Label */}
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Continue reading
        </p>

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <h2 className="font-serif text-2xl font-semibold text-text leading-tight">
            {item.title}
          </h2>
          <p className="font-sans text-sm text-text-muted">
            Page {item.page}
          </p>
        </div>

        {/* Resume action */}
        <div className="flex items-center gap-4 pt-1">
          <Button
            onClick={() => { onResume(item.docId); }}
            className={[
              'bg-accent hover:bg-accent/90 active:bg-accent/80',
              'text-on-accent font-sans font-medium text-sm',
              'rounded-xl px-5 h-9',
              'shadow-sm',
              'transition-all duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              'group-hover:shadow-md',
            ].join(' ')}
          >
            Resume
          </Button>
        </div>
      </div>
    </div>
  );
}
