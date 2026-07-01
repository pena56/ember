/**
 * push-device-card.test.tsx — render tests for the PushDeviceCard component.
 *
 * The card is presentational (pure props in, no data hooks), so no convex/bundle
 * mocks are needed — tests render it directly with plain fixture props.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DevicePickerRow } from '../settings/device-picker-rows.js';
import { PushDeviceCard } from '../settings/push-device-card.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function row(overrides: Partial<DevicePickerRow> & { deviceId: string }): DevicePickerRow {
  return {
    platform: 'ios',
    isPrimary: false,
    hasToken: true,
    lastSeenAt: NOW - 5 * MIN,
    isCurrent: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

describe('PushDeviceCard — >= 2 rows', () => {
  it('renders a radiogroup with one radio per device row', () => {
    const rows = [
      row({ deviceId: 'a', isPrimary: true }),
      row({ deviceId: 'b', platform: 'android' }),
    ];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('the isPrimary row is aria-checked', () => {
    const rows = [
      row({ deviceId: 'a', isPrimary: true }),
      row({ deviceId: 'b', isPrimary: false }),
    ];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    const radios = screen.getAllByRole('radio');
    const primaryRadio = radios.find((r) => r.getAttribute('aria-checked') === 'true');
    expect(primaryRadio).toBeTruthy();
    // Only one is checked
    const checkedCount = radios.filter((r) => r.getAttribute('aria-checked') === 'true').length;
    expect(checkedCount).toBe(1);
  });

  it('the isCurrent row shows the "This device" chip', () => {
    const rows = [
      row({ deviceId: 'a', isCurrent: true }),
      row({ deviceId: 'b', isCurrent: false }),
    ];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(screen.getByText('This device')).toBeTruthy();
  });

  it('a !hasToken row shows "Not receiving push yet"', () => {
    const rows = [
      row({ deviceId: 'a', hasToken: false, isCurrent: true }),
      row({ deviceId: 'b', hasToken: true }),
    ];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(screen.getByText('Not receiving push yet')).toBeTruthy();
  });

  it('renders last-seen text from formatRelativeLastSeen', () => {
    const lastSeenAt = NOW - 3 * HOUR;
    const rows = [
      row({ deviceId: 'a', lastSeenAt }),
      row({ deviceId: 'b' }),
    ];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    // formatRelativeLastSeen(NOW, NOW - 3h) = "Active 3h ago"
    expect(screen.getByText('Active 3h ago')).toBeTruthy();
  });

  it('clicking a non-primary row calls onSelectPrimary with that deviceId', () => {
    const onSelectPrimary = vi.fn();
    const rows = [
      row({ deviceId: 'a', isPrimary: true }),
      row({ deviceId: 'b', isPrimary: false }),
    ];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={onSelectPrimary} />,
    );
    // Find the non-primary radio and click it
    const radios = screen.getAllByRole('radio');
    const nonPrimaryRadio = radios.find((r) => r.getAttribute('aria-checked') !== 'true');
    expect(nonPrimaryRadio).toBeTruthy();
    fireEvent.click(nonPrimaryRadio!);
    expect(onSelectPrimary).toHaveBeenCalledWith('b');
  });
});

describe('PushDeviceCard — < 2 rows', () => {
  it('does NOT render a radiogroup when there is only 1 row', () => {
    const rows = [row({ deviceId: 'a', isCurrent: true })];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('renders the informational copy when there is only 1 row', () => {
    const rows = [row({ deviceId: 'a', isCurrent: true })];
    render(
      <PushDeviceCard rows={rows} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(
      screen.getByText(/Only this device is registered/i),
    ).toBeTruthy();
  });

  it('does NOT render a radiogroup when there are 0 rows', () => {
    render(
      <PushDeviceCard rows={[]} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('renders the informational copy when there are 0 rows', () => {
    render(
      <PushDeviceCard rows={[]} nowMs={NOW} onSelectPrimary={vi.fn()} />,
    );
    expect(
      screen.getByText(/Only this device is registered/i),
    ).toBeTruthy();
  });
});
