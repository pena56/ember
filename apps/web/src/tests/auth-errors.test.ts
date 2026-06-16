/**
 * auth-errors.test.ts — friendlyAuthError mapping.
 *
 * Guarantees raw Convex server strings are never returned, and that known
 * error tokens map to calm, useful copy per flow.
 */

import { describe, expect, it } from 'vitest';

import { friendlyAuthError } from '../auth/auth-errors.js';

const RAW_INVALID_SECRET = new Error(
  '[CONVEX A(auth:signIn)] [Request ID: b0ea0d137d20d93b] Server Error\n' +
    'Uncaught Error: InvalidSecret\n    Called by client',
);

describe('friendlyAuthError', () => {
  it('never leaks raw Convex/stack text', () => {
    const out = friendlyAuthError(RAW_INVALID_SECRET, 'signIn');
    expect(out).not.toMatch(/CONVEX|Request ID|Uncaught|InvalidSecret|Called by client/i);
  });

  it('signIn: InvalidSecret → incorrect email or password', () => {
    expect(friendlyAuthError(RAW_INVALID_SECRET, 'signIn')).toBe('Incorrect email or password.');
  });

  it('signIn: InvalidAccountId → incorrect email or password (no account-exists leak)', () => {
    expect(friendlyAuthError(new Error('Uncaught Error: InvalidAccountId'), 'signIn')).toBe(
      'Incorrect email or password.',
    );
  });

  it('signUp: existing account → steer to sign in', () => {
    expect(friendlyAuthError(new Error('Account already exists'), 'signUp')).toBe(
      'An account with that email already exists — try signing in instead.',
    );
  });

  it('signUp: weak password → length guidance', () => {
    expect(friendlyAuthError(new Error('Invalid password'), 'signUp')).toBe(
      'Please choose a password with at least 8 characters.',
    );
  });

  it('rate limiting maps regardless of flow', () => {
    expect(friendlyAuthError(new Error('TooManyFailedAttempts'), 'signIn')).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );
  });

  it('network failure maps to a connection message', () => {
    expect(friendlyAuthError(new TypeError('Failed to fetch'), 'signIn')).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    );
  });

  it('unknown error → generic fallback per flow', () => {
    expect(friendlyAuthError(new Error('boom'), 'signUp')).toBe('Something went wrong. Please try again.');
    expect(friendlyAuthError({}, 'signOut')).toBe("Couldn't sign out. Please try again.");
  });
});
