/**
 * account-section.test.tsx — Settings Account section tests.
 *
 * Supersedes account-menu.test.tsx (the header pill was replaced by this
 * Settings section). Mocks convex auth + use-account + auth-dialog + sonner so
 * no real client is needed in jsdom.
 *
 * (1) loading  → no interactive control (aria-hidden placeholder)
 * (2) anonymous → "Save your library" opens the dialog
 * (3) claimed  → shows the email + a Sign out button
 * (4) claimed  → clicking Sign out calls signOut()
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountSection } from '../settings/account-section.js';

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
}));

const { mockUseAccount } = vi.hoisted(() => ({
  mockUseAccount: vi.fn(() => ({
    status: 'loading' as 'loading' | 'anonymous' | 'claimed',
    email: undefined as string | undefined,
  })),
}));

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: mockSignOut }),
}));

vi.mock('../auth/use-account.js', () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock('../auth/auth-dialog.js', () => ({
  AuthDialog: ({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? <div data-testid="auth-dialog">AuthDialog</div> : null,
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  Toaster: () => null,
}));

describe('AccountSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    mockUseAccount.mockReturnValue({ status: 'loading', email: undefined });
  });

  afterEach(() => {
    cleanup();
  });

  it('(1) loading state renders no interactive control', () => {
    mockUseAccount.mockReturnValue({ status: 'loading', email: undefined });
    render(<AccountSection />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('(2) anonymous state shows "Save your library" and opens the dialog', async () => {
    mockUseAccount.mockReturnValue({ status: 'anonymous', email: undefined });
    render(<AccountSection />);

    const btn = screen.getByRole('button', { name: /save your library/i });
    expect(screen.queryByTestId('auth-dialog')).toBeNull();

    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => {
      expect(screen.getByTestId('auth-dialog')).toBeDefined();
    });
  });

  it('(3) claimed state shows the email and a Sign out button', () => {
    mockUseAccount.mockReturnValue({ status: 'claimed', email: 'test@example.com' });
    render(<AccountSection />);

    expect(screen.getByText('test@example.com')).toBeDefined();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  });

  it('(4) claimed state: clicking Sign out calls signOut()', async () => {
    mockUseAccount.mockReturnValue({ status: 'claimed', email: 'test@example.com' });
    render(<AccountSection />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });
});
