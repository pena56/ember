/**
 * highlight-layer.test.tsx — HighlightLayer component tests.
 *
 * Verifies: renders positioned rects for a highlight spanning 2 items,
 * renders nothing when geometry is undefined, note annotations render as
 * pin + dotted underline (not fill), click fires onSelectAnnotation.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Annotation, PageTextGeometry } from '@ember/core';

import { HighlightLayer } from '../reader/highlight-layer.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Geometry with 2 text items on the same line.
 * Page: 800×1000 px (for easy math)
 */
const GEO: PageTextGeometry = {
  pageNumber: 1,
  items: [
    { index: 0, str: 'Hello', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.02 } },
    { index: 1, str: ' world', box: { x: 0.3, y: 0.1, width: 0.25, height: 0.02 } },
  ],
};

const PAGE_W = 800;
const PAGE_H = 1000;

// Annotation that spans both items (startChar=0, endChar=11 = "Hello world")
const HIGHLIGHT_BOTH: Annotation = {
  id: 'ann-1',
  docId: 'doc-x',
  kind: 'highlight',
  anchor: { kind: 'text', page: 1, startChar: 0, endChar: 11, quote: 'Hello world' },
  color: 'yellow',
  createdAt: 1000,
  updatedAt: 'hlc-1',
};

const NOTE_ANN: Annotation = {
  id: 'note-1',
  docId: 'doc-x',
  kind: 'note',
  anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' },
  note: 'A note',
  createdAt: 2000,
  updatedAt: 'hlc-2',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderLayer(annotations: Annotation[], onSelectAnnotation = vi.fn()) {
  return render(
    <HighlightLayer
      annotations={annotations}
      geometry={GEO}
      pageWidth={PAGE_W}
      pageHeight={PAGE_H}
      onSelectAnnotation={onSelectAnnotation}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => { cleanup(); });

describe('HighlightLayer', () => {
  it('renders nothing when geometry is undefined', () => {
    const { container } = render(
      <HighlightLayer
        annotations={[HIGHLIGHT_BOTH]}
        geometry={undefined}
        pageWidth={PAGE_W}
        pageHeight={PAGE_H}
        onSelectAnnotation={vi.fn()}
      />,
    );

    // Should render null → nothing in DOM.
    expect(container.firstChild).toBeNull();
  });

  it('renders 2 positioned rects for a highlight spanning 2 items', () => {
    const { container } = renderLayer([HIGHLIGHT_BOTH]);

    // Should have the outer wrapper + 2 rect buttons.
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.children).toHaveLength(2);

    const rect1 = wrapper.children[0] as HTMLElement;
    const rect2 = wrapper.children[1] as HTMLElement;

    // Both should have absolute positioning with correct pixel values.
    // Item 0: x=0.1, y=0.1, w=0.2, h=0.02 → left=80, top=100, w=160, h=20
    expect(rect1.style.left).toBe('80px');
    expect(rect1.style.top).toBe('100px');
    expect(rect1.style.width).toBe('160px');
    expect(rect1.style.height).toBe('20px');

    // Item 1: x=0.3, y=0.1, w=0.25, h=0.02 → left=240, top=100, w=200, h=20
    expect(rect2.style.left).toBe('240px');
    expect(rect2.style.top).toBe('100px');
    expect(rect2.style.width).toBe('200px');
    expect(rect2.style.height).toBe('20px');
  });

  it('applies a highlight color class to each rect', () => {
    const { container } = renderLayer([HIGHLIGHT_BOTH]);

    const wrapper = container.firstChild as HTMLElement;
    const rect1 = wrapper.children[0] as HTMLElement;
    // Should have the highlight-yellow class (with some opacity modifier).
    expect(rect1.className).toContain('highlight-yellow');
  });

  it('clicking a highlight rect fires onSelectAnnotation with the annotation + rect', () => {
    const onSelectAnnotation = vi.fn();
    renderLayer([HIGHLIGHT_BOTH], onSelectAnnotation);

    // The first rect button for HIGHLIGHT_BOTH (there are 2 with same label)
    const btns = screen.getAllByLabelText(/^Highlight: "/);
    expect(btns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(btns[0]!);

    expect(onSelectAnnotation).toHaveBeenCalledOnce();
    const [annotation, rect] = onSelectAnnotation.mock.calls[0] as [Annotation, { left: number; top: number; width: number; height: number }];
    expect(annotation.id).toBe('ann-1');
    expect(typeof rect.left).toBe('number');
    expect(typeof rect.top).toBe('number');
  });

  it('highlight rects are <button> elements with pointer-events-auto', () => {
    const { container } = renderLayer([HIGHLIGHT_BOTH]);
    const wrapper = container.firstChild as HTMLElement;
    const rect1 = wrapper.children[0] as HTMLElement;
    expect(rect1.tagName).toBe('BUTTON');
    expect(rect1.className).toContain('pointer-events-auto');
  });

  it('a kind:"note" annotation renders a pin button + dotted underline, NOT a fill', () => {
    const { container } = renderLayer([NOTE_ANN]);
    const wrapper = container.firstChild as HTMLElement;

    // Pin button (unique label "Note: ...") should exist
    const pinBtn = screen.getByLabelText(/^Note: "/);
    expect(pinBtn).toBeDefined();

    // Underline button(s) should exist (label "Note underline: ...")
    const underlineBtns = screen.getAllByLabelText(/^Note underline: "/);
    expect(underlineBtns.length).toBeGreaterThanOrEqual(1);

    // No fill rect (highlight fill divs should not be present)
    // All children are note-related; none should have highlight-* color classes
    for (const child of Array.from(wrapper.children)) {
      expect((child as HTMLElement).className).not.toContain('bg-highlight-');
    }
  });

  it('a kind:"note" pin button fires onSelectAnnotation when clicked', () => {
    const onSelectAnnotation = vi.fn();
    renderLayer([NOTE_ANN], onSelectAnnotation);

    // The pin has a unique aria-label "Note: ..." (underline has "Note underline: ...")
    const pinBtn = screen.getByLabelText(/^Note: "/);
    fireEvent.click(pinBtn);

    expect(onSelectAnnotation).toHaveBeenCalledOnce();
    const [annotation] = onSelectAnnotation.mock.calls[0] as [Annotation];
    expect(annotation.id).toBe('note-1');
  });

  it('a highlight carrying a note shows a note-dot element', () => {
    const highlightWithNote: Annotation = { ...HIGHLIGHT_BOTH, note: 'Has a note' };
    const { container } = renderLayer([highlightWithNote]);
    const wrapper = container.firstChild as HTMLElement;

    // Should contain a note-dot indicator somewhere
    const noteDot = wrapper.querySelector('[data-note-dot]');
    expect(noteDot).not.toBeNull();
  });

  it('renders nothing when annotations array is empty', () => {
    const { container } = renderLayer([]);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children).toHaveLength(0);
  });

  it('outer layer is pointer-events-none', () => {
    const { container } = renderLayer([HIGHLIGHT_BOTH]);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('pointer-events-none');
  });

  it('outer layer sits above the text layer (z-10) so its buttons are clickable', () => {
    // Regression guard: .textLayer is z-index:0 with no pointer-events:none, so without
    // an explicit higher z-index the text layer intercepts every click on the annotation
    // buttons (notes + highlights) below it. z-10 lifts the interactive layer on top.
    const { container } = renderLayer([HIGHLIGHT_BOTH]);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('z-10');
  });
});
