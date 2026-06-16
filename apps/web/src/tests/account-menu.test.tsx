/**
 * account-menu.test.tsx — AccountMenu component tests.
 *
 * Mocks @convex-dev/auth/react and convex/react so no real client is needed in jsdom.
 * Tests: loading placeholder, anonymous state opens dialog, claimed state shows email + sign out.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenu } from '../auth/account-menu.js';

// ── Hoist mocks for variables that are referenced in vi.mock factories ─────────
// vi.hoisted() / vi.mock() are hoisted to the top by vitest regardless of source
// position, so they run before any module is imported.

const { mockSignOut, mockSignIn } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockSignIn: vi.fn().mockResolvedValue(undefined),
}));

const { mockUseAccount } = vi.hoisted(() => ({
  mockUseAccount: vi.fn(() => ({ status: 'loading' as 'loading' | 'anonymous' | 'claimed', email: undefined as string | undefined })),
}));

// ── Mock @convex-dev/auth/react ───────────────────────────────────────────────

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: mockSignIn, signOut: mockSignOut }),
  useConvexAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: false })),
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
}));

// ── Mock convex/react ─────────────────────────────────────────────────────────

vi.mock('convex/react', () => ({
  useConvexAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: false })),
  useQuery: () => undefined,
}));

// ── Mock use-account (controls AccountMenu state) ────────────────────────────

vi.mock('../auth/use-account.js', () => ({
  useAccount: () => mockUseAccount(),
}));

// ── Mock sonner ────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
  Toaster: () => null,
}));

// ── Mock auth-dialog to keep tests focused ────────────────────────────────────

vi.mock('../auth/auth-dialog.js', () => ({
  AuthDialog: ({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? <div data-testid="auth-dialog">AuthDialog</div> : null,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    mockSignIn.mockResolvedValue(undefined);
    mockUseAccount.mockReturnValue({ status: 'loading', email: undefined });
  });

  afterEach(() => {
    cleanup();
  });

  it('(1) loading state renders a neutral placeholder (no button text)', () => {
    mockUseAccount.mockReturnValue({ status: 'loading', email: undefined });

    render(<AccountMenu />);

    // Should not show any interactive text
    expect(screen.queryByRole('button')).toBeNull();
    // The aria-hidden placeholder div is present
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('(2) anonymous state shows "Save your library" and opens the dialog on click', async () => {
    mockUseAccount.mockReturnValue({ status: 'anonymous', email: undefined });

    render(<AccountMenu />);

    const btn = screen.getByRole('button', { name: /save your library/i });
    expect(btn).toBeDefined();

    // Dialog should be closed initially
    expect(screen.queryByTestId('auth-dialog')).toBeNull();

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-dialog')).toBeDefined();
    });
  });

  it('(3) claimed state shows truncated email and a Sign out button', () => {
    mockUseAccount.mockReturnValue({ status: 'claimed', email: 'test@example.com' });

    render(<AccountMenu />);

    expect(screen.getByText(/test@example.com/)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  });

  it('(4) claimed state: clicking Sign out calls signOut()', async () => {
    mockUseAccount.mockReturnValue({ status: 'claimed', email: 'test@example.com' });

    render(<AccountMenu />);

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });

    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('(5) claimed state: long email is truncated in display but title retains full value', () => {
    const longEmail = 'averylongemailaddress@example.com';
    mockUseAccount.mockReturnValue({ status: 'claimed', email: longEmail });

    render(<AccountMenu />);

    const emailEl = screen.getByTitle(longEmail);
    expect(emailEl).toBeDefined();
    // Display text is truncated
    const displayText = emailEl.textContent ?? '';
    expect(displayText.length).toBeLessThan(longEmail.length);
  });
});
