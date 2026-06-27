/**
 * duplicate-prompt.test.tsx — component tests for DuplicatePrompt (props-driven).
 * No store access — pure presentational test.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Document, DuplicatePair } from '@ember/core';

import { DuplicatePrompt } from '../library/duplicate-prompt.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const docA: Document = {
  id: 'doc-a',
  title: 'The Great Gatsby',
  filename: 'great-gatsby-v1.pdf',
  byteSize: 1_000_000,
  importedAt: new Date('2026-01-01').getTime(),
  contentType: 'application/pdf',
};

const docB: Document = {
  id: 'doc-b',
  title: 'The Great Gatsby',
  filename: 'great-gatsby-v2.pdf',
  byteSize: 1_050_000,
  importedAt: new Date('2026-02-01').getTime(),
  contentType: 'application/pdf',
};

const pair: DuplicatePair = { aId: 'doc-a', bId: 'doc-b' };

function renderPrompt(overrides: Partial<{
  onMerge: (id: string) => void;
  onKeepSeparate: () => void;
  onDismiss: () => void;
}> = {}) {
  return render(
    <DuplicatePrompt
      pair={pair}
      docs={{ a: docA, b: docB }}
      defaultCanonicalId="doc-b"
      onMerge={overrides.onMerge ?? vi.fn()}
      onKeepSeparate={overrides.onKeepSeparate ?? vi.fn()}
      onDismiss={overrides.onDismiss ?? vi.fn()}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DuplicatePrompt', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the Fraunces title line', () => {
    renderPrompt();
    expect(screen.getByText(/This looks like a book you already have/i)).toBeDefined();
  });

  it('renders both copy cards with filenames', () => {
    renderPrompt();
    expect(screen.getByText('great-gatsby-v1.pdf')).toBeDefined();
    expect(screen.getByText('great-gatsby-v2.pdf')).toBeDefined();
  });

  it('radio group has role="radiogroup"', () => {
    renderPrompt();
    const group = screen.getByRole('radiogroup');
    expect(group).toBeDefined();
  });

  it('radio cards have aria-checked', () => {
    renderPrompt();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(2);
    // defaultCanonicalId = doc-b, so doc-b card is checked
    const checkedRadios = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checkedRadios.length).toBe(1);
  });

  it('clicking the other copy card updates aria-checked', () => {
    renderPrompt();
    const radios = screen.getAllByRole('radio');
    // Initially doc-b is selected; click doc-a card
    fireEvent.click(radios[0]!); // doc-a

    const updatedRadios = screen.getAllByRole('radio');
    expect(updatedRadios[0]!.getAttribute('aria-checked')).toBe('true');
    expect(updatedRadios[1]!.getAttribute('aria-checked')).toBe('false');
  });

  it('Merge button calls onMerge with the selected canonicalId', () => {
    const onMerge = vi.fn();
    renderPrompt({ onMerge });

    // Default canonical = doc-b
    const mergeBtn = screen.getByRole('button', { name: /merge/i });
    fireEvent.click(mergeBtn);

    expect(onMerge).toHaveBeenCalledWith('doc-b');
  });

  it('Merge calls onMerge with newly selected canonicalId after radio change', () => {
    const onMerge = vi.fn();
    renderPrompt({ onMerge });

    // Switch selection to doc-a
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]!); // doc-a

    fireEvent.click(screen.getByRole('button', { name: /merge/i }));
    expect(onMerge).toHaveBeenCalledWith('doc-a');
  });

  it('Keep both button calls onKeepSeparate', () => {
    const onKeepSeparate = vi.fn();
    renderPrompt({ onKeepSeparate });

    fireEvent.click(screen.getByRole('button', { name: /keep both/i }));
    expect(onKeepSeparate).toHaveBeenCalledOnce();
  });

  it('Not now button calls onDismiss', () => {
    const onDismiss = vi.fn();
    renderPrompt({ onDismiss });

    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('is a labelled section (a11y)', () => {
    renderPrompt();
    const section = screen.getByRole('region', { name: /possible duplicate book/i });
    expect(section).toBeDefined();
  });

  it('keyboard: pressing Enter on a copy card selects it', () => {
    renderPrompt();
    const radios = screen.getAllByRole('radio');
    // Focus doc-a card and press Enter
    fireEvent.keyDown(radios[0]!, { key: 'Enter' });
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('keyboard: pressing Space on a copy card selects it', () => {
    renderPrompt();
    const radios = screen.getAllByRole('radio');
    fireEvent.keyDown(radios[0]!, { key: ' ' });
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
  });
});
