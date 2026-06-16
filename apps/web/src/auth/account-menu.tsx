/**
 * account-menu.tsx — header account control rendered beside ThemeControl.
 *
 * States:
 *   loading   → neutral placeholder (no layout shift)
 *   anonymous → "Save your library" button that opens AuthDialog
 *   claimed   → truncated email + "Sign out" button
 *
 * Token-driven — no hardcoded colors (invariant #6).
 * Sized to match ThemeControl: font-sans text-sm, py-1.5, rounded-md border border-line.
 */

import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AuthDialog } from './auth-dialog.js';
import { friendlyAuthError } from './auth-errors.js';
import { useAccount } from './use-account.js';

export function AccountMenu() {
  const { status, email } = useAccount();
  const { signOut } = useAuthActions();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (status === 'loading') {
    // Neutral placeholder — exact dimensions of the anonymous button to prevent layout shift
    return (
      <div
        className="h-[34px] w-[118px] rounded-md bg-surface-raised border border-line animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (status === 'claimed') {
    // Truncate at 20 chars for display; full value in title attribute for tooltip
    const truncated = email && email.length > 22 ? `${email.slice(0, 20)}…` : email;
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2.5 py-1.5">
        <span
          className="font-sans text-sm text-text-muted truncate max-w-[140px] leading-none"
          title={email}
        >
          {truncated}
        </span>
        {/* Hairline separator between email and action */}
        <span className="h-3 w-px bg-line flex-shrink-0" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => {
              toast.success('Signed out.');
            }).catch((err: unknown) => {
              toast.error(friendlyAuthError(err, 'signOut'));
            });
          }}
          className="font-sans text-sm text-text-muted hover:text-text transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm leading-none flex-shrink-0"
        >
          Sign out
        </button>
      </div>
    );
  }

  // anonymous — warm accent CTA, matches ThemeControl height via matching py-1.5
  return (
    <>
      <button
        type="button"
        onClick={() => { setDialogOpen(true); }}
        className="font-sans text-sm px-3 py-1.5 rounded-md bg-accent text-on-accent font-medium transition-colors duration-150 hover:bg-accent/90 active:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Save your library
      </button>
      <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
