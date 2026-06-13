/**
 * highlight-layer.test.tsx — HighlightLayer component tests.
 *
 * Verifies: renders positioned rects for a highlight spanning 2 items,
 * renders nothing when geometry is undefined, ignores 'note' kind records.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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
      />,
    );

    // Should render null → nothing in DOM.
    expect(container.firstChild).toBeNull();
  });

  it('renders 2 positioned rects for a highlight spanning 2 items', () => {
    const { container } = render(
      <HighlightLayer
        annotations={[HIGHLIGHT_BOTH]}
        geometry={GEO}
        pageWidth={PAGE_W}
        pageHeight={PAGE_H}
      />,
    );

    // Should have the outer wrapper + 2 rect divs.
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
    const { container } = render(
      <HighlightLayer
        annotations={[HIGHLIGHT_BOTH]}
        geometry={GEO}
        pageWidth={PAGE_W}
        pageHeight={PAGE_H}
      />,
    );

    const wrapper = container.firstChild as HTMLElement;
    const rect1 = wrapper.children[0] as HTMLElement;
    // Should have the highlight-yellow class (with some opacity modifier).
    expect(rect1.className).toContain('highlight-yellow');
  });

  it('ignores annotations with kind "note"', () => {
    const { container } = render(
      <HighlightLayer
        annotations={[NOTE_ANN]}
        geometry={GEO}
        pageWidth={PAGE_W}
        pageHeight={PAGE_H}
      />,
    );

    const wrapper = container.firstChild as HTMLElement;
    // No rects should be rendered for a note.
    expect(wrapper.children).toHaveLength(0);
  });

  it('renders nothing when annotations array is empty', () => {
    const { container } = render(
      <HighlightLayer
        annotations={[]}
        geometry={GEO}
        pageWidth={PAGE_W}
        pageHeight={PAGE_H}
      />,
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children).toHaveLength(0);
  });

  it('layer is aria-hidden and pointer-events-none', () => {
    const { container } = render(
      <HighlightLayer
        annotations={[HIGHLIGHT_BOTH]}
        geometry={GEO}
        pageWidth={PAGE_W}
        pageHeight={PAGE_H}
      />,
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.className).toContain('pointer-events-none');
  });
});
