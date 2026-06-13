/**
 * selection-toolbar.test.tsx — SelectionToolbar component tests.
 *
 * Tests that: clicking a swatch calls onCreate with the resolved anchor + color;
 * renders null when selection is collapsed.
 *
 * Strategy: build a hand-crafted page DOM (data-page wrapper + .textLayer div
 * with spans), fake window.getSelection(), trigger the selectionchange event,
 * then click swatches.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageTextGeometry } from '@ember/core';

import { SelectionToolbar } from '../reader/selection-toolbar.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal page DOM:
 *   <div data-page="1">
 *     <div class="textLayer">
 *       <span>Hello</span><span> world</span>
 *     </div>
 *   </div>
 */
function buildPageDOM() {
  const pageWrapper = document.createElement('div');
  pageWrapper.setAttribute('data-page', '1');

  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';

  const span1 = document.createElement('span');
  span1.appendChild(document.createTextNode('Hello'));
  const span2 = document.createElement('span');
  span2.appendChild(document.createTextNode(' world'));

  textLayer.appendChild(span1);
  textLayer.appendChild(span2);
  pageWrapper.appendChild(textLayer);
  document.body.appendChild(pageWrapper);

  return { pageWrapper, textLayer, span1, span2 };
}

const GEO: PageTextGeometry = {
  pageNumber: 1,
  items: [
    { index: 0, str: 'Hello', box: { x: 0, y: 0, width: 0.1, height: 0.02 } },
    { index: 1, str: ' world', box: { x: 0.1, y: 0, width: 0.2, height: 0.02 } },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  // Clean up any page DOM appended to body.
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SelectionToolbar', () => {
  it('renders null initially (no selection)', () => {
    const onCreate = vi.fn();
    const { container } = render(
      <SelectionToolbar
        pageGeometries={new Map([[1, GEO]])}
        onCreate={onCreate}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders null when selection is collapsed', async () => {
    const { pageWrapper } = buildPageDOM();
    const textNode = pageWrapper.querySelector('.textLayer span')!.childNodes[0]!;

    // Stub getSelection to return a collapsed selection.
    const mockRange = {
      collapsed: true,
      startContainer: textNode,
      startOffset: 2,
      endContainer: textNode,
      endOffset: 2,
      getBoundingClientRect: () => ({ left: 100, top: 200, right: 150, bottom: 215, width: 50, height: 15 }),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      isCollapsed: true,
      getRangeAt: () => mockRange as unknown as Range,
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    const onCreate = vi.fn();
    const { container } = render(
      <SelectionToolbar
        pageGeometries={new Map([[1, GEO]])}
        onCreate={onCreate}
      />,
    );

    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      // Wait for rAF
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(container.firstChild).toBeNull();
  });

  it('shows toolbar with 4 color swatches when there is a non-collapsed selection', async () => {
    const { pageWrapper } = buildPageDOM();
    const helloNode = pageWrapper.querySelector('.textLayer span')!.childNodes[0]!;
    const worldNode = pageWrapper.querySelectorAll('.textLayer span')[1]!.childNodes[0]!;

    const mockRange = {
      collapsed: false,
      startContainer: helloNode,
      startOffset: 0,
      endContainer: worldNode,
      endOffset: 3,
      getBoundingClientRect: () => ({ left: 100, top: 300, right: 250, bottom: 315, width: 150, height: 15 }),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => mockRange as unknown as Range,
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    // Attach the page DOM to the container that will be queried.
    // The SelectionToolbar climbs up from anchorNode; it reads from pageWrapper.
    // pageWrapper is already in document.body (from buildPageDOM).

    const onCreate = vi.fn();
    render(
      <SelectionToolbar
        pageGeometries={new Map([[1, GEO]])}
        onCreate={onCreate}
      />,
    );

    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((r) => requestAnimationFrame(r));
    });

    // 4 swatch buttons should be visible.
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);

    // Check aria-labels.
    expect(screen.getByLabelText('Highlight yellow')).toBeDefined();
    expect(screen.getByLabelText('Highlight green')).toBeDefined();
    expect(screen.getByLabelText('Highlight blue')).toBeDefined();
    expect(screen.getByLabelText('Highlight pink')).toBeDefined();
  });

  it('clicking a swatch calls onCreate with the resolved anchor + that color', async () => {
    const { pageWrapper } = buildPageDOM();
    const helloNode = pageWrapper.querySelector('.textLayer span')!.childNodes[0]!;
    const worldNode = pageWrapper.querySelectorAll('.textLayer span')[1]!.childNodes[0]!;

    const removeAllRanges = vi.fn();
    const mockRange = {
      collapsed: false,
      startContainer: helloNode,
      startOffset: 0,
      endContainer: worldNode,
      endOffset: 6, // full " world"
      getBoundingClientRect: () => ({ left: 100, top: 300, right: 250, bottom: 315, width: 150, height: 15 }),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => mockRange as unknown as Range,
      removeAllRanges,
    } as unknown as Selection);

    const onCreate = vi.fn();
    render(
      <SelectionToolbar
        pageGeometries={new Map([[1, GEO]])}
        onCreate={onCreate}
      />,
    );

    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((r) => requestAnimationFrame(r));
    });

    const yellowBtn = screen.getByLabelText('Highlight yellow');
    await act(async () => {
      fireEvent.click(yellowBtn);
    });

    expect(onCreate).toHaveBeenCalledOnce();
    const call = onCreate.mock.calls[0]![0];
    expect(call.color).toBe('yellow');
    expect(call.anchor.kind).toBe('text');
    expect(call.anchor.page).toBe(1);
    expect(call.anchor.startChar).toBe(0);
    // endChar should be 11 (Hello=5 + ' world'=6)
    expect(call.anchor.endChar).toBe(11);
    expect(call.anchor.quote).toBe('Hello world');

    // Selection should be cleared.
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('clicking a different color swatch calls onCreate with that color', async () => {
    const { pageWrapper } = buildPageDOM();
    const helloNode = pageWrapper.querySelector('.textLayer span')!.childNodes[0]!;

    const removeAllRanges = vi.fn();
    const mockRange = {
      collapsed: false,
      startContainer: helloNode,
      startOffset: 0,
      endContainer: helloNode,
      endOffset: 5,
      getBoundingClientRect: () => ({ left: 100, top: 300, right: 200, bottom: 315, width: 100, height: 15 }),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => mockRange as unknown as Range,
      removeAllRanges,
    } as unknown as Selection);

    const onCreate = vi.fn();
    render(
      <SelectionToolbar
        pageGeometries={new Map([[1, GEO]])}
        onCreate={onCreate}
      />,
    );

    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((r) => requestAnimationFrame(r));
    });

    const blueBtn = screen.getByLabelText('Highlight blue');
    await act(async () => {
      fireEvent.click(blueBtn);
    });

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0]![0].color).toBe('blue');
  });
});
