/**
 * annotation-popover.test.tsx — AnnotationPopover component tests.
 *
 * Verifies: highlight → swatch recolor calls onRecolor; textarea save calls onEditNote;
 * trash calls onDelete; note → empty save disabled; Esc closes.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Annotation } from '@ember/core';

import { AnnotationPopover } from '../reader/annotation-popover.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RECT = { left: 100, top: 200, width: 50, height: 20 };

const HIGHLIGHT: Annotation = {
  id: 'ann-1',
  docId: 'doc-x',
  kind: 'highlight',
  anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' },
  color: 'yellow',
  createdAt: 1000,
  updatedAt: 'hlc-1',
};

const NOTE_ANN: Annotation = {
  id: 'note-1',
  docId: 'doc-x',
  kind: 'note',
  anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' },
  note: 'Existing note text',
  createdAt: 2000,
  updatedAt: 'hlc-2',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RenderOptions {
  annotation?: Annotation | null;
  rect?: typeof RECT | null;
  onRecolor?: (color: import('@ember/core').HighlightColor) => void;
  onEditNote?: (text: string) => void;
  onDelete?: () => void;
  onClose?: () => void;
}

function renderPopover({
  annotation = HIGHLIGHT,
  rect = RECT,
  onRecolor = vi.fn() as (color: import('@ember/core').HighlightColor) => void,
  onEditNote = vi.fn() as (text: string) => void,
  onDelete = vi.fn() as () => void,
  onClose = vi.fn() as () => void,
}: RenderOptions = {}) {
  return render(
    <AnnotationPopover
      annotation={annotation}
      rect={rect}
      onRecolor={onRecolor}
      onEditNote={onEditNote}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AnnotationPopover', () => {
  it('renders nothing when annotation is null', () => {
    const { container } = renderPopover({ annotation: null, rect: null });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when rect is null', () => {
    const { container } = renderPopover({ rect: null });
    expect(container.firstChild).toBeNull();
  });

  // ── Highlight mode ──────────────────────────────────────────────────────────

  it('highlight: renders 4 color swatches', () => {
    renderPopover({ annotation: HIGHLIGHT });

    expect(screen.getByLabelText('Recolor yellow')).toBeDefined();
    expect(screen.getByLabelText('Recolor green')).toBeDefined();
    expect(screen.getByLabelText('Recolor blue')).toBeDefined();
    expect(screen.getByLabelText('Recolor pink')).toBeDefined();
  });

  it('highlight: clicking a swatch calls onRecolor with that color', () => {
    const onRecolor = vi.fn();
    renderPopover({ annotation: HIGHLIGHT, onRecolor });

    fireEvent.click(screen.getByLabelText('Recolor blue'));

    expect(onRecolor).toHaveBeenCalledWith('blue');
  });

  it('highlight: current color swatch is marked (aria-pressed=true)', () => {
    renderPopover({ annotation: HIGHLIGHT }); // color = yellow

    const yellowBtn = screen.getByLabelText('Recolor yellow');
    expect(yellowBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('highlight: textarea save calls onEditNote with trimmed text', () => {
    const onEditNote = vi.fn();
    renderPopover({ annotation: HIGHLIGHT, onEditNote });

    const textarea = screen.getByPlaceholderText('Add a note…');
    fireEvent.change(textarea, { target: { value: 'My note' } });

    const saveBtn = screen.getByRole('button', { name: /save note/i });
    fireEvent.click(saveBtn);

    expect(onEditNote).toHaveBeenCalledWith('My note');
  });

  it('highlight: trash button calls onDelete', () => {
    const onDelete = vi.fn();
    renderPopover({ annotation: HIGHLIGHT, onDelete });

    fireEvent.click(screen.getByLabelText('Delete highlight'));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('highlight: renders a note textarea', () => {
    renderPopover({ annotation: HIGHLIGHT });

    expect(screen.getByPlaceholderText('Add a note…')).toBeDefined();
  });

  // ── Note mode ───────────────────────────────────────────────────────────────

  it('note: does NOT render color swatches', () => {
    renderPopover({ annotation: NOTE_ANN });

    expect(screen.queryByLabelText('Recolor yellow')).toBeNull();
    expect(screen.queryByLabelText('Recolor blue')).toBeNull();
  });

  it('note: renders textarea with existing note text', () => {
    renderPopover({ annotation: NOTE_ANN });

    const textarea = screen.getByDisplayValue('Existing note text');
    expect(textarea).toBeDefined();
  });

  it('note: Save button is disabled when textarea is empty', () => {
    const emptyNote: Annotation = { ...NOTE_ANN, note: '' };
    renderPopover({ annotation: emptyNote });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '' } });

    const saveBtn = screen.getByRole('button', { name: /save note/i });
    expect(saveBtn).toHaveProperty('disabled', true);
  });

  it('note: Save button enabled when textarea has text', () => {
    renderPopover({ annotation: NOTE_ANN });

    const saveBtn = screen.getByRole('button', { name: /save note/i });
    expect(saveBtn).toHaveProperty('disabled', false);
  });

  it('note: clicking save calls onEditNote with the note text', () => {
    const onEditNote = vi.fn();
    renderPopover({ annotation: NOTE_ANN, onEditNote });

    const saveBtn = screen.getByRole('button', { name: /save note/i });
    fireEvent.click(saveBtn);

    expect(onEditNote).toHaveBeenCalledWith('Existing note text');
  });

  it('note: trash button calls onDelete', () => {
    const onDelete = vi.fn();
    renderPopover({ annotation: NOTE_ANN, onDelete });

    fireEvent.click(screen.getByLabelText('Delete note'));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderPopover({ annotation: HIGHLIGHT, onClose });

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pressing Esc calls onClose', () => {
    const onClose = vi.fn();
    renderPopover({ annotation: HIGHLIGHT, onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
