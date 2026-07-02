/**
 * app-shell.tsx — shared layout for Today / Library / Stats / Settings
 * (not the full-screen reader).
 *
 * Redesign: a collapsible left sidebar over an ambient warm-glow backdrop, with
 * page content floating on top. The sidebar is a translucent, blurred glass
 * panel: Ember wordmark (top) → collapse toggle → Primary nav (Today / Library /
 * Stats / Settings) → account shortcut pinned to the footer. Account controls and
 * theme selection now live inside Settings, not the shell chrome.
 *
 * Collapsed state persists to localStorage so it survives reloads. Nav labels
 * stay in the DOM when collapsed (visually hidden) so links keep their accessible
 * names and tooltips.
 *
 * Semantic markup: <aside> + <nav aria-label="Primary"> + <main>.
 * Token-driven — no hardcoded colors (invariant #6).
 */

import { ChartColumn, Library, PanelLeft, Settings, Sunrise } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { AmbientBackdrop } from './shell/ambient-backdrop.js';
import { SidebarAccount } from './shell/sidebar-account.js';

const COLLAPSE_KEY = 'ember:sidebar-collapsed';

// ── Nav model ─────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/today', label: 'Today', icon: Sunrise },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/stats', label: 'Stats', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// ── Collapse persistence ────────────────────────────────────────────────────

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

// ── Ember wordmark ────────────────────────────────────────────────────────────

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 select-none"
      aria-label="Ember Reader"
    >
      {/* Flame glyph — the ember mark */}
      <svg
        width="14"
        height="18"
        viewBox="0 0 12 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="text-accent flex-shrink-0"
        style={{ filter: 'drop-shadow(0 0 4px color-mix(in srgb, currentColor 55%, transparent))' }}
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
      {!collapsed && (
        <span className="font-serif text-lg font-semibold tracking-tight text-text leading-none">
          Ember
        </span>
      )}
    </span>
  );
}

// ── Nav tab ─────────────────────────────────────────────────────────────────

function Tab({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-sm px-3 py-3 outline-none transition-colors duration-150',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          collapsed ? 'justify-center' : '',
          isActive
            ? 'bg-accent/10 text-text font-medium'
            : 'text-text-muted hover:text-text hover:bg-surface',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={['size-5 flex-shrink-0', isActive ? 'text-accent' : ''].join(' ')}
            strokeWidth={isActive ? 2.25 : 2}
          />
          <span className={['font-sans text-sm', collapsed ? 'sr-only' : ''].join(' ')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable — collapse stays in-memory only */
      }
      return next;
    });
  }, []);

  return (
    <div className="relative min-h-screen text-text">
      <AmbientBackdrop />

      <div className="flex min-h-screen">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside
          className={[
            'sticky top-0 z-10 flex h-screen flex-shrink-0 flex-col',
            'border-r border-line bg-surface-raised',
            'transition-[width] duration-200 ease-out motion-reduce:transition-none',
            collapsed ? 'w-[4.5rem]' : 'w-60',
          ].join(' ')}
        >
          {/* Header: wordmark + collapse toggle */}
          <div
            className={[
              'flex h-14 items-center px-3',
              collapsed ? 'justify-center' : 'justify-between',
            ].join(' ')}
          >
            {!collapsed && (
              <div className="pl-1.5">
                <Wordmark collapsed={false} />
              </div>
            )}
            {collapsed && <Wordmark collapsed />}
          </div>

          {/* Collapse toggle */}
          <div className={['px-3 pb-2', collapsed ? 'flex justify-center' : ''].join(' ')}>
            <button
              type="button"
              onClick={toggle}
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex size-8 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <PanelLeft className="size-4" />
            </button>
          </div>

          {/* Primary nav */}
          <nav aria-label="Primary" className="flex flex-1 flex-col gap-1.5 px-3 pt-1">
            {NAV_ITEMS.map((item) => (
              <Tab key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>

          {/* Account shortcut — pinned to footer */}
          <div className="border-t border-line py-3">
            <SidebarAccount collapsed={collapsed} />
          </div>
        </aside>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
