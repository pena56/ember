/**
 * claim-reload.ts — finish a claim / sign-in with a deliberate reload.
 *
 * Why a reload: @convex-dev/auth derives `isAuthenticated` from
 * `token !== null`. The anonymous→password *claim* (and switching to another
 * existing account) swaps one non-null token for another, so `isAuthenticated`
 * never flips and `fetchAccessToken` keeps a stable identity. convex/react's
 * ConvexProviderWithAuth only re-calls `client.setAuth(...)` when those change,
 * so on a claim it never re-fetches — every live query (incl. currentUser)
 * keeps running under the *old anonymous* token until the page reloads.
 *
 * Re-invoking `client.setAuth` ourselves would clobber the provider's backend
 * auth-state callback, so we reload instead: on the next load the provider
 * reads the stored password token and lands cleanly in the claimed state. The
 * success toast is stashed and shown after the reload. (Sign-out flips the
 * token to null — a real status change — so it updates reactively, no reload.)
 */

const PENDING_TOAST_KEY = 'ember:auth-toast';

/** Stash the success message, then reload to adopt the new identity. */
export function finishAuthWithReload(message: string): void {
  try {
    sessionStorage.setItem(PENDING_TOAST_KEY, message);
  } catch {
    // sessionStorage may be unavailable (private mode / SSR); the reload still
    // corrects auth state — we just lose the toast.
  }
  window.location.reload();
}

/** Read + clear any toast stashed by finishAuthWithReload (call once on mount). */
export function consumePendingAuthToast(): string | null {
  try {
    const msg = sessionStorage.getItem(PENDING_TOAST_KEY);
    if (msg !== null) sessionStorage.removeItem(PENDING_TOAST_KEY);
    return msg;
  } catch {
    return null;
  }
}
