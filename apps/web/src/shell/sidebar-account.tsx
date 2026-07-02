/**
 * sidebar-account.tsx — the account shortcut pinned to the sidebar footer.
 *
 * This is NOT the account control — sign-in / claim / sign-out all live in
 * Settings now. This is a glanceable status row that links to /settings:
 *   loading   → muted placeholder (no layout shift)
 *   anonymous → "Guest" + a gentle "Save your library" hint
 *   claimed   → avatar initial + truncated email
 *
 * Collapsed: renders just the avatar, centered, with a title tooltip.
 * Token-driven — no hardcoded colors (invariant #6).
 */

import { LogIn, User } from 'lucide-react';
import { NavLink } from 'react-router';

import { useAccount } from '../auth/use-account.js';

export function SidebarAccount({ collapsed }: { collapsed: boolean }) {
  const { status, email } = useAccount();

  if (status === 'loading') {
    return (
      <div
        className="mx-2 h-12 rounded-sm bg-surface animate-pulse"
        aria-hidden="true"
      />
    );
  }

  const claimed = status === 'claimed';
  const initial = claimed && email ? email[0]!.toUpperCase() : undefined;
  const primary = claimed ? (email ?? 'Your account') : 'Guest';
  const secondary = claimed ? 'View account' : 'Save your library';
  const title = claimed ? email : 'Save your library';

  return (
    <NavLink
      to="/settings"
      title={collapsed ? title : undefined}
      className={({ isActive }) =>
        [
          'mx-2 flex items-center gap-3 rounded-sm px-2.5 py-2 outline-none transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          collapsed ? 'justify-center' : '',
          isActive ? 'bg-accent/10' : 'hover:bg-surface',
        ].join(' ')
      }
    >
      {/* Avatar */}
      <span
        className={[
          'flex size-9 flex-shrink-0 items-center justify-center rounded-full font-sans text-sm font-medium',
          claimed
            ? 'bg-accent/15 text-accent'
            : 'bg-surface text-text-muted border border-line',
        ].join(' ')}
        aria-hidden="true"
      >
        {claimed
          ? (initial ?? <User className="size-4" />)
          : <LogIn className="size-4" />}
      </span>

      {/* Label (hidden when collapsed) */}
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-sans text-sm font-medium text-text">
            {primary}
          </span>
          <span className="truncate font-sans text-xs text-text-muted">
            {secondary}
          </span>
        </span>
      )}
    </NavLink>
  );
}
