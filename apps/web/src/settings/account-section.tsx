/**
 * account-section.tsx — Account settings section.
 *
 * The home for all account actions (relocated from the old header AccountMenu):
 *   loading   → muted skeleton rows (no layout shift)
 *   anonymous → explains local-only state + "Save your library" (opens AuthDialog)
 *   claimed   → shows the signed-in email + "Sign out"
 *
 * Uses the shared SettingsSection shell.
 * Token-only styling (invariant #6 — no hardcoded colors).
 */

import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';

import { AuthDialog } from '../auth/auth-dialog.js';
import { friendlyAuthError } from '../auth/auth-errors.js';
import { useAccount } from '../auth/use-account.js';

import { SettingsSection } from './settings-section.js';

export function AccountSection() {
  const { status, email } = useAccount();
  const { signOut } = useAuthActions();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SettingsSection title="Account">
      {status === 'loading' && (
        <div className="flex flex-col gap-2 px-5 py-5" aria-hidden="true">
          <div className="h-4 w-44 animate-pulse rounded-sm bg-surface" />
          <div className="h-3 w-64 animate-pulse rounded-sm bg-surface" />
        </div>
      )}

      {status === 'anonymous' && (
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-sans text-sm text-text">Your library lives on this device</p>
            <p className="font-sans text-sm leading-relaxed text-text-muted">
              Create an account to save it and pick up your reading anywhere.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => { setDialogOpen(true); }}
            className="flex-shrink-0 self-start sm:self-auto"
          >
            Save your library
          </Button>
        </div>
      )}

      {status === 'claimed' && (
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-sans text-sm text-text-muted">Signed in as</p>
            <p className="truncate font-sans text-sm font-medium text-text" title={email}>
              {email}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void signOut()
                .then(() => { toast.success('Signed out.'); })
                .catch((err: unknown) => { toast.error(friendlyAuthError(err, 'signOut')); });
            }}
            className="flex-shrink-0 self-start sm:self-auto"
          >
            Sign out
          </Button>
        </div>
      )}

      <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SettingsSection>
  );
}
