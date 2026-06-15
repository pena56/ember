/**
 * auth-dialog.tsx — claim / sign-in dialog.
 *
 * Default mode: Create account (signUp).
 * Toggle:       "Already have an account? Sign in" → Sign in mode (signIn).
 *
 * On success: close + toast.success with warm voice.
 * On failure: inline field error + toast.error (no raw stack).
 *
 * Accessibility: title + description, labelled inputs, type="email"/"password",
 * Enter submits, Esc closes (shadcn Dialog handles focus trap).
 * Token-driven — no hardcoded colors (invariant #6).
 */

import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';

import { friendlyAuthError } from './auth-errors.js';

type Mode = 'signUp' | 'signIn';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Inline spinner (token-driven, no external dep) ───────────────────────────

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin text-on-accent"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { signIn } = useAuthActions();

  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail('');
    setPassword('');
    setError(null);
    setPending(false);
    setMode('signUp');
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic client-side validation before calling
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setPending(true);
    try {
      await signIn('password', { email: email.trim(), password, flow: mode });
      onOpenChange(false);
      reset();
      if (mode === 'signUp') {
        toast.success('Your library is saved.');
      } else {
        toast.success('Welcome back.');
      }
    } catch (err) {
      const msg = friendlyAuthError(err, mode);
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
       * max-w-sm keeps the form compact and readable — auth dialogs benefit from
       * narrow focus. The gap-5 grid (shadcn default is gap-4) adds a touch more
       * breathing room between header, form, and toggle.
       */}
      <DialogContent className="max-w-sm gap-5">
        <DialogHeader className="gap-1">
          {/* Fraunces serif for heading — matches brand typography (ui-context) */}
          <DialogTitle className="font-serif text-xl font-semibold tracking-tight text-text">
            {mode === 'signUp' ? 'Create account' : 'Sign in'}
          </DialogTitle>
          <DialogDescription className="text-sm text-text-muted leading-relaxed">
            {mode === 'signUp'
              ? 'Save your reading library and keep your progress across devices.'
              : 'Welcome back — sign in to pick up where you left off.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { void handleSubmit(e); }} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email" className="text-sm font-medium text-text">
              Email
            </Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              disabled={pending}
              aria-invalid={!!error}
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-password" className="text-sm font-medium text-text">
              Password
            </Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              disabled={pending}
              aria-invalid={!!error}
            />
          </div>

          {/*
           * Error: calm inline presentation — small, muted-warm tone, not alarming red banner.
           * role="alert" ensures screen readers announce it immediately on appearance.
           */}
          {error && (
            <p
              id="auth-error"
              role="alert"
              className="text-sm text-destructive leading-snug"
            >
              {error}
            </p>
          )}

          {/*
           * Pending state: spinner + label pair inside the button.
           * aria-disabled keeps the element in the focus order for screen readers
           * while pointer-events-none prevents double-submit.
           */}
          <Button
            type="submit"
            disabled={pending}
            className="w-full gap-2 mt-1"
          >
            {pending ? (
              <>
                <Spinner />
                <span>Please wait…</span>
              </>
            ) : mode === 'signUp' ? (
              'Create account'
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        {/*
         * Mode toggle — centered, clear prose phrasing.
         * The toggle link uses accent color (not just `text-text`) so it reads
         * as an active affordance distinct from the surrounding muted prose.
         */}
        <div className="text-center border-t border-line pt-4">
          {mode === 'signUp' ? (
            <p className="text-sm text-text-muted">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('signIn'); setError(null); }}
                className="text-accent font-medium hover:text-accent/80 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              New here?{' '}
              <button
                type="button"
                onClick={() => { setMode('signUp'); setError(null); }}
                className="text-accent font-medium hover:text-accent/80 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
              >
                Create account
              </button>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
