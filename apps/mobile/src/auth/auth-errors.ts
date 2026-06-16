/**
 * auth-errors.ts — turn raw Convex Auth errors into calm, useful copy.
 *
 * Convex surfaces server failures as messages like
 *   "[CONVEX A(auth:signIn)] [Request ID: …] Server Error
 *    Uncaught Error: InvalidSecret Called by client"
 * which must never reach the user. We match on the stable error tokens that
 * @convex-dev/auth returns (InvalidSecret / InvalidAccountId / etc.) and fall
 * back to a generic line — so the UI shows one tidy sentence, never a stack.
 *
 * Intentional duplication of the web copy (logic is identical and
 * platform-agnostic); recorded as a follow-up to extract a shared module if a
 * third consumer or drift appears — do not extract now (keeps 11c single-boundary).
 */

export type AuthMode = 'signUp' | 'signIn' | 'signOut';

/** Lowercased haystack of whatever the error carried. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === 'string') return err.toLowerCase();
  return '';
}

export function friendlyAuthError(err: unknown, mode: AuthMode): string {
  const msg = messageOf(err);

  // Rate limiting — same wording regardless of flow.
  if (msg.includes('toomanyfailedattempts') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // Network / transport — the request never reached (or returned from) Convex.
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed')
  ) {
    return "Couldn't reach the server. Check your connection and try again.";
  }

  if (mode === 'signIn') {
    // InvalidSecret = wrong password; InvalidAccountId = no such account.
    // Merge both into one message so we don't reveal which emails exist.
    if (msg.includes('invalidsecret') || msg.includes('invalidaccountid')) {
      return 'Incorrect email or password.';
    }
  }

  if (mode === 'signUp') {
    // Email already registered — steer them to sign in instead.
    if (
      msg.includes('already') ||
      msg.includes('exists') ||
      msg.includes('invalidsecret') ||
      msg.includes('invalidaccountid')
    ) {
      return 'An account with that email already exists — try signing in instead.';
    }
    // Convex Password rejects weak passwords (default: 8+ chars).
    if (msg.includes('password') && (msg.includes('invalid') || msg.includes('short') || msg.includes('8'))) {
      return 'Please choose a password with at least 8 characters.';
    }
  }

  return mode === 'signOut'
    ? "Couldn't sign out. Please try again."
    : 'Something went wrong. Please try again.';
}
