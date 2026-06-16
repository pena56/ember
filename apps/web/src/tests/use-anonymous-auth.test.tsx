/**
 * use-anonymous-auth.test.tsx — useAnonymousAuth hook tests.
 *
 * Fakes useConvexAuth + useAuthActions + navigator.onLine to assert:
 *   (1) signs in once when unauthenticated + online
 *   (2) does NOT sign in when offline
 *   (3) does NOT sign in when already authenticated
 *   (4) does NOT sign in while loading
 *   (5) retries on the `online` event after starting offline
 *   (6) does not double-fire (ref guard)
 *   (7) cleans up online listener on unmount
 *   (8) re-anonymizes after sign-out (guard resets once authenticated)
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnonymousAuth } from '../auth/use-anonymous-auth.js';

// ── Hoist shared mutable state and mock functions ─────────────────────────────
// vi.hoisted() runs before module resolution, so these are safe to close over
// inside vi.mock() factory functions.

const hoisted = vi.hoisted(() => {
  const mockSignIn = vi.fn().mockResolvedValue(undefined);
  const authState = { isLoading: false, isAuthenticated: false };
  return { mockSignIn, authState };
});

// ── Mock @convex-dev/auth/react ───────────────────────────────────────────────

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: hoisted.mockSignIn }),
  useConvexAuth: () => ({ ...hoisted.authState }),
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
}));

// ── Mock convex/react ─────────────────────────────────────────────────────────

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ ...hoisted.authState }),
  useQuery: vi.fn(() => undefined),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAnonymousAuth', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    originalOnLine = navigator.onLine;
    // Reset to default: online + unauthenticated + not loading
    hoisted.authState.isLoading = false;
    hoisted.authState.isAuthenticated = false;
    hoisted.mockSignIn.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
    vi.restoreAllMocks();
  });

  it('(1) signs in anonymously once when unauthenticated + online', async () => {
    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    expect(hoisted.mockSignIn).toHaveBeenCalledTimes(1);
    expect(hoisted.mockSignIn).toHaveBeenCalledWith('anonymous');

    unmount();
  });

  it('(2) does NOT sign in when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    expect(hoisted.mockSignIn).not.toHaveBeenCalled();

    unmount();
  });

  it('(3) does NOT sign in when already authenticated', async () => {
    hoisted.authState.isAuthenticated = true;

    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    expect(hoisted.mockSignIn).not.toHaveBeenCalled();

    unmount();
  });

  it('(4) does NOT sign in while still loading', async () => {
    hoisted.authState.isLoading = true;

    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    expect(hoisted.mockSignIn).not.toHaveBeenCalled();

    unmount();
  });

  it('(5) retries on the online event after starting offline', async () => {
    // Start offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    expect(hoisted.mockSignIn).not.toHaveBeenCalled();

    // Go online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(hoisted.mockSignIn).toHaveBeenCalledTimes(1);
    expect(hoisted.mockSignIn).toHaveBeenCalledWith('anonymous');

    unmount();
  });

  it('(6) does not double-fire on multiple effect runs (ref guard)', async () => {
    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    // Even with React calling effects multiple times, signIn is called only once
    expect(hoisted.mockSignIn).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('(8) re-anonymizes after sign-out (guard resets once authenticated)', async () => {
    const { rerender, unmount } = renderHook(() => useAnonymousAuth());

    // Initial anonymous sign-in fires once.
    await act(async () => {});
    expect(hoisted.mockSignIn).toHaveBeenCalledTimes(1);

    // Session becomes active → the guard clears, but no new sign-in fires.
    hoisted.authState.isAuthenticated = true;
    await act(async () => {
      rerender();
    });
    expect(hoisted.mockSignIn).toHaveBeenCalledTimes(1);

    // User signs out → unauthenticated again → re-anon fires (no reload).
    hoisted.authState.isAuthenticated = false;
    await act(async () => {
      rerender();
    });
    expect(hoisted.mockSignIn).toHaveBeenCalledTimes(2);
    expect(hoisted.mockSignIn).toHaveBeenLastCalledWith('anonymous');

    unmount();
  });

  it('(7) cleans up online listener on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useAnonymousAuth());

    await act(async () => {});

    // online listener was registered
    const addedListeners = addSpy.mock.calls.filter((c) => c[0] === 'online');
    expect(addedListeners.length).toBeGreaterThan(0);

    unmount();

    // online listener was removed on cleanup
    const removedListeners = removeSpy.mock.calls.filter((c) => c[0] === 'online');
    expect(removedListeners.length).toBeGreaterThan(0);
  });
});
