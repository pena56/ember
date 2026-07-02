/**
 * storage-meter.test.tsx — quota meter component.
 *
 * Tests:
 *  (1) hidden when usage is undefined
 *  (2) renders aria attributes correctly (role, aria-valuenow, aria-valuemax, aria-valuemin)
 *  (3) shows usage text ("X of Y used")
 *  (4) near-limit treatment applied when usage >= 80% of quota
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlobLimits } from '@ember/core';

import { StorageMeter } from '../library/storage-meter.js';

// Mock useStorageUsage so tests don't need convex
vi.mock('../sync/use-storage-usage.js', () => ({
  useStorageUsage: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function mockUsage(value: BlobLimits | undefined) {
  const { useStorageUsage } = await import('../sync/use-storage-usage.js');
  (useStorageUsage as ReturnType<typeof vi.fn>).mockReturnValue(value);
}

describe('StorageMeter', () => {
  it('(1) renders nothing while usage is undefined', async () => {
    await mockUsage(undefined);
    const { container } = render(<StorageMeter />);
    expect(container.firstChild).toBeNull();
  });

  it('(2) renders progressbar with correct aria attributes', async () => {
    await mockUsage({ used: 500_000_000, quota: 1_073_741_824, fileCap: 52_428_800 });
    render(<StorageMeter />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toBeDefined();
    expect(bar.getAttribute('aria-valuenow')).toBe('500000000');
    expect(bar.getAttribute('aria-valuemax')).toBe('1073741824');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
  });

  it('(3) shows human-readable usage text', async () => {
    await mockUsage({ used: 312_000_000, quota: 1_000_000_000, fileCap: 52_428_800 });
    render(<StorageMeter />);

    // "used of quota" line (e.g. "312.0 MB of 1000.0 MB")
    expect(screen.getByText(/MB of .*MB/i)).toBeDefined();
    // percent-used and free lines
    expect(screen.getByText(/%\s*used/i)).toBeDefined();
    expect(screen.getByText(/free/i)).toBeDefined();
  });

  it('(4) applies near-limit treatment when usage >= 80% quota', async () => {
    await mockUsage({ used: 900_000_000, quota: 1_000_000_000, fileCap: 52_428_800 });
    render(<StorageMeter />);

    // The meter fill should have a near-limit (amber) class
    const bar = screen.getByRole('progressbar');
    const fill = bar.querySelector('[data-near-limit="true"]');
    expect(fill).not.toBeNull();
  });

  it('(5) does NOT apply near-limit treatment below 80%', async () => {
    await mockUsage({ used: 700_000_000, quota: 1_000_000_000, fileCap: 52_428_800 });
    render(<StorageMeter />);

    const bar = screen.getByRole('progressbar');
    const fill = bar.querySelector('[data-near-limit="false"]');
    expect(fill).not.toBeNull();
  });
});
