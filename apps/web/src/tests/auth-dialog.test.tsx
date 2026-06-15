/**
 * auth-dialog.test.tsx — AuthDialog component tests.
 *
 * Mocks @convex-dev/auth/react so no real client is needed in jsdom.
 * Tests: signUp submit, mode toggle to signIn, error handling, empty field blocking.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthDialog } from '../auth/auth-dialog.js';

// ── Hoist mocks so vi.mock() factories can reference them ─────────────────────
// vi.hoisted() is evaluated before module resolution.

const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }));

// ── Mock @convex-dev/auth/react ───────────────────────────────────────────────

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: mockSignIn, signOut: vi.fn() }),
  useConvexAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: false })),
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
}));

// ── Mock convex/react ─────────────────────────────────────────────────────────

vi.mock('convex/react', () => ({
  useConvexAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: false })),
  useQuery: vi.fn(() => undefined),
}));

// ── Mock sonner ────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
  Toaster: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDialog(open = true, onOpenChange = vi.fn()) {
  return render(<AuthDialog open={open} onOpenChange={onOpenChange} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('(1) renders "Create account" title by default', () => {
    renderDialog();
    // Heading renders "Create account" (may also appear on the button, use heading role)
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeDefined();
  });

  it('(2) submit in create mode calls signIn with flow: "signUp" and entered credentials', async () => {
    const onOpenChange = vi.fn();
    renderDialog(true, onOpenChange);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);
    });

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('password', {
        email: 'user@test.com',
        password: 'secret123',
        flow: 'signUp',
      });
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Your library is saved.');
  });

  it('(3) toggling to sign in mode calls signIn with flow: "signIn"', async () => {
    const onOpenChange = vi.fn();
    renderDialog(true, onOpenChange);

    // Toggle to sign in
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Mode should flip — both title and submit button update
    await waitFor(() => {
      expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'mypassword' } });

    await act(async () => {
      const form = screen.getByLabelText(/email/i).closest('form')!;
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('password', {
        email: 'user@test.com',
        password: 'mypassword',
        flow: 'signIn',
      });
    });

    expect(toast.success).toHaveBeenCalledWith('Welcome back.');
  });

  it('(4) rejected signIn shows inline error + toast.error, dialog stays open', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));
    const onOpenChange = vi.fn();
    renderDialog(true, onOpenChange);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });

    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/email/i).closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByRole('alert').textContent).toContain('Invalid credentials');
    });

    expect(toast.error).toHaveBeenCalledWith('Invalid credentials');
    // Dialog stays open
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('(5) empty email is blocked — signIn not called, error shown', async () => {
    renderDialog();

    // Leave email empty, fill password
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });

    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/email/i).closest('form')!);
    });

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Email is required');
  });

  it('(6) empty password is blocked — signIn not called, error shown', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } });
    // Leave password empty

    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/email/i).closest('form')!);
    });

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Password is required');
  });
});
