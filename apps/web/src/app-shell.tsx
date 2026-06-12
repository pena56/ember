/**
 * app-shell.tsx — shared layout for Today + Library (not the full-screen reader).
 *
 * Sticky top-nav: Ember wordmark (left) + Today/Library NavLinks (center-left) +
 * ThemeControl (right). Body renders <Outlet/> for the active tab.
 *
 * Marked up semantically: <header> + <nav aria-label="Primary"> + <main>.
 * Token-driven — no hardcoded colors (invariant #6).
 */

import { NavLink, Outlet } from 'react-router';

import { ThemeControl } from './theme/theme-control.js';

// ── NavLink active class helper ───────────────────────────────────────────────

function tabClass({ isActive }: { isActive: boolean }) {
  return [
    'relative font-sans text-sm px-1 py-1 transition-colors duration-200 outline-none',
    'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent rounded-sm',
    // The animated underline is drawn via ::after — we use a group trick with a data attr
    isActive
      ? 'text-text font-medium'
      : 'text-text-muted hover:text-text',
    // Underline drawn as bottom border on the span inside
  ].join(' ');
}

// ── Tab with animated underline ───────────────────────────────────────────────

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} className={tabClass}>
      {({ isActive }) => (
        <span className="inline-flex flex-col items-center gap-0.5">
          {children}
          <span
            className={[
              'block h-[1.5px] w-full rounded-full transition-all duration-300 ease-out',
              isActive ? 'bg-accent opacity-100 scale-x-100' : 'bg-accent opacity-0 scale-x-50',
            ].join(' ')}
            style={{ transformOrigin: 'left center' }}
          />
        </span>
      )}
    </NavLink>
  );
}

// ── Ember wordmark ────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <span
      className="select-none"
      aria-label="Ember Reader"
    >
      {/* Flame glyph — tiny ember mark before the word */}
      <span
        className="inline-flex items-baseline gap-1.5"
        aria-hidden="false"
      >
        <svg
          width="12"
          height="16"
          viewBox="0 0 12 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="text-accent mb-0.5 flex-shrink-0"
          style={{ filter: 'drop-shadow(0 0 3px color-mix(in srgb, currentColor 50%, transparent))' }}
        >
          <path
            d="M6 0C6 0 1 6 1 12C1 15.314 3.239 18 6 18C8.761 18 11 15.314 11 12C11 8 8.5 5 7.5 3C7.5 3 7 7 6 8C5 7 6 0 6 0Z"
            fill="currentColor"
            fillOpacity="0.9"
          />
          <path
            d="M6 8C6 8 4 11 4 13C4 14.105 4.895 15 6 15C7.105 15 8 14.105 8 13C8 11 6 8 6 8Z"
            fill="currentColor"
            fillOpacity="0.35"
          />
        </svg>
        <span className="font-serif text-lg font-semibold tracking-tight text-text leading-none">
          Ember
        </span>
      </span>
    </span>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      <header
        className="sticky top-0 z-10 bg-surface/95 border-b border-line"
        style={{ backdropFilter: 'blur(8px)' }}
      >
        <div className="mx-auto max-w-2xl px-6 h-14 flex items-center gap-6">
          {/* Wordmark */}
          <Wordmark />

          {/* Hairline separator */}
          <span className="h-4 w-px bg-line flex-shrink-0" aria-hidden="true" />

          {/* Primary nav */}
          <nav aria-label="Primary" className="flex items-center gap-5 flex-1">
            <Tab to="/today">Today</Tab>
            <Tab to="/library">Library</Tab>
          </nav>

          {/* Theme control */}
          <ThemeControl />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
