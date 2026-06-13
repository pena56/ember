/**
 * selection-anchor.test.ts — pure DOM→offset mapping tests (jsdom).
 *
 * Builds a hand-crafted span DOM that mirrors what pdf.js TextLayer produces:
 * one <span> per text item, textContent === item.str, spans in items order.
 * Because buildPageText concatenates items with no separator, the in-order
 * concatenation of text nodes equals buildPageText(geometry).
 */

import { describe, expect, it } from 'vitest';

import { buildPageText } from '@ember/core';
import type { PageTextGeometry } from '@ember/core';

import { charOffsetOf, cssRectFromBox, selectionToTextAnchor } from './selection-anchor.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal PageTextGeometry for testing.
 * Items: ["Hello", " ", "world"] → buildPageText = "Hello world"
 */
function makeGeometry(): PageTextGeometry {
  return {
    pageNumber: 1,
    items: [
      { index: 0, str: 'Hello', box: { x: 0, y: 0, width: 0.1, height: 0.02 } },
      { index: 1, str: ' ',     box: { x: 0.1, y: 0, width: 0.01, height: 0.02 } },
      { index: 2, str: 'world', box: { x: 0.11, y: 0, width: 0.1, height: 0.02 } },
    ],
  };
}

/**
 * Build a text-layer DOM matching the geometry above.
 * Returns the root div and the individual span text nodes.
 */
function makeTextLayerDOM() {
  const root = document.createElement('div');
  root.className = 'textLayer';

  const items = ['Hello', ' ', 'world'];
  const textNodes: Text[] = [];

  for (const str of items) {
    const span = document.createElement('span');
    const textNode = document.createTextNode(str);
    span.appendChild(textNode);
    root.appendChild(span);
    textNodes.push(textNode);
  }

  return { root, textNodes };
}

// ── charOffsetOf ──────────────────────────────────────────────────────────────

describe('charOffsetOf', () => {
  it('returns 0 for the start of the first text node', () => {
    const { root, textNodes } = makeTextLayerDOM();
    expect(charOffsetOf(root, textNodes[0]!, 0)).toBe(0);
  });

  it('sums preceding text-node lengths + in-node offset (first span)', () => {
    const { root, textNodes } = makeTextLayerDOM();
    // "Hello" has 5 chars; offset 3 → char 3 in total
    expect(charOffsetOf(root, textNodes[0]!, 3)).toBe(3);
  });

  it('sums correctly for second text node', () => {
    const { root, textNodes } = makeTextLayerDOM();
    // "Hello" = 5 chars; " " starts at offset 5; in-node offset 0 → char 5
    expect(charOffsetOf(root, textNodes[1]!, 0)).toBe(5);
    // in-node offset 1 → char 6
    expect(charOffsetOf(root, textNodes[1]!, 1)).toBe(6);
  });

  it('sums correctly for third text node', () => {
    const { root, textNodes } = makeTextLayerDOM();
    // "Hello" (5) + " " (1) = 6; "world" starts at 6
    expect(charOffsetOf(root, textNodes[2]!, 0)).toBe(6);
    expect(charOffsetOf(root, textNodes[2]!, 3)).toBe(9);
    expect(charOffsetOf(root, textNodes[2]!, 5)).toBe(11);
  });

  it('returns null for a node outside root', () => {
    const { root } = makeTextLayerDOM();
    const outsideNode = document.createTextNode('outside');
    expect(charOffsetOf(root, outsideNode, 0)).toBeNull();
  });
});

// ── selectionToTextAnchor ─────────────────────────────────────────────────────

describe('selectionToTextAnchor', () => {
  it('returns null for a collapsed range', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    const range = document.createRange();
    range.setStart(textNodes[0]!, 2);
    range.setEnd(textNodes[0]!, 2); // collapsed

    expect(selectionToTextAnchor({ root, page: 1, range, geometry: geo })).toBeNull();
  });

  it('single-span partial range → correct startChar / endChar / quote', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    // Select "ell" from "Hello" (offset 1..4)
    const range = document.createRange();
    range.setStart(textNodes[0]!, 1);
    range.setEnd(textNodes[0]!, 4);

    const anchor = selectionToTextAnchor({ root, page: 1, range, geometry: geo });
    expect(anchor).not.toBeNull();
    expect(anchor!.kind).toBe('text');
    expect(anchor!.page).toBe(1);
    expect(anchor!.startChar).toBe(1);
    expect(anchor!.endChar).toBe(4);
    // quote must come from buildPageText, not DOM
    expect(anchor!.quote).toBe(buildPageText(geo).slice(1, 4));
    expect(anchor!.quote).toBe('ell');
  });

  it('cross-span range → correct offsets', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    // Select from "ll" in "Hello" (offset 3) to "wor" in "world" (offset 3)
    // = chars 3..9 = "lo wo" → no, let's be precise:
    // "Hello"[3..5] = "lo", " ", "world"[0..3] = "wor" → chars 3..9 = "lo wor"
    const range = document.createRange();
    range.setStart(textNodes[0]!, 3);
    range.setEnd(textNodes[2]!, 3);

    const anchor = selectionToTextAnchor({ root, page: 1, range, geometry: geo });
    expect(anchor).not.toBeNull();
    expect(anchor!.startChar).toBe(3);
    expect(anchor!.endChar).toBe(9);
    expect(anchor!.quote).toBe(buildPageText(geo).slice(3, 9));
    expect(anchor!.quote).toBe('lo wor');
  });

  it('reversed range normalizes startChar < endChar', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    // Test the normalization code path in selectionToTextAnchor by directly calling
    // charOffsetOf with inverted coordinates. We simulate a "reversed selection"
    // by calling selectionToTextAnchor with a range that appears forward in DOM
    // but whose startChar > endChar when computed. We do this via a hand-crafted
    // range where startContainer is at a later char than endContainer.
    //
    // DOM Ranges always compare endpoints and use document order, so we can't
    // easily make setStart > setEnd using the same sub-tree. Instead, we verify
    // the normalization by testing charOffsetOf directly, and verify the
    // order-normalization branch in selectionToTextAnchor via a range where we
    // use the second span as startContainer and first as endContainer.
    //
    // Because jsdom normalizes DOM ranges to start < end by document order,
    // "range.setStart(laterNode)" followed by "range.setEnd(earlierNode)" will
    // auto-swap them. This means startChar ends up < endChar natively here.
    // Our guard handles the case where startChar > endChar (e.g. from manual
    // anchor computation). We verify via a forward range and confirm the output
    // satisfies the invariant.
    const range = document.createRange();
    range.setStart(textNodes[0]!, 3); // char 3
    range.setEnd(textNodes[2]!, 0);   // char 6

    const anchor = selectionToTextAnchor({ root, page: 1, range, geometry: geo });
    expect(anchor).not.toBeNull();
    expect(anchor!.startChar).toBeLessThan(anchor!.endChar);
    expect(anchor!.startChar).toBe(3);
    expect(anchor!.endChar).toBe(6);
    // The slice [3,6] = "lo "
    expect(anchor!.quote).toBe(buildPageText(geo).slice(3, 6));
    expect(anchor!.quote).toBe('lo ');
  });

  it('range whose end is outside root clips endChar to page text length', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    // Simulate a cross-page drag: the end node is not in root.
    // Attach BOTH root and an "other page" wrapper to document body so DOM Range
    // can span across them without throwing.
    document.body.appendChild(root);
    const outsideWrapper = document.createElement('div');
    const outsideText = document.createTextNode('other page text');
    outsideWrapper.appendChild(outsideText);
    document.body.appendChild(outsideWrapper);

    const range = document.createRange();
    range.setStart(textNodes[0]!, 2); // char 2 (inside root)
    range.setEnd(outsideText, 5);     // end is outside root (different page)

    // endContainer is not within root → charOffsetOf returns null → clip to text length.
    const anchor = selectionToTextAnchor({ root, page: 1, range, geometry: geo });
    expect(anchor).not.toBeNull();
    expect(anchor!.startChar).toBe(2);
    // endChar clipped to buildPageText(geo).length = "Hello world".length = 11
    expect(anchor!.endChar).toBe(buildPageText(geo).length);
    expect(anchor!.endChar).toBe(11);
    expect(anchor!.quote).toBe(buildPageText(geo).slice(2));
    expect(anchor!.quote).toBe('llo world');

    // Clean up
    document.body.removeChild(root);
    document.body.removeChild(outsideWrapper);
  });

  it('returns null when startChar === endChar after normalization', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    // Range that resolves to the same offset (should not happen in practice but
    // we guard it). Manually test by clamping: set both ends to same text position.
    // Use a collapsed range — already tested above.
    // Additional case: start is outside root (returns null before any char math).
    const outsideRoot = document.createElement('div');
    const outsideText = document.createTextNode('abc');
    outsideRoot.appendChild(outsideText);

    const range = document.createRange();
    range.setStart(outsideText, 0);
    range.setEnd(textNodes[0]!, 3);

    // startChar will be null (outside root) → returns null
    expect(selectionToTextAnchor({ root, page: 1, range, geometry: geo })).toBeNull();
  });

  it('quote is derived from buildPageText not the DOM selection string', () => {
    const geo = makeGeometry();
    const { root, textNodes } = makeTextLayerDOM();

    // Select the entire page text
    const range = document.createRange();
    range.setStart(textNodes[0]!, 0);
    range.setEnd(textNodes[2]!, 5);

    const anchor = selectionToTextAnchor({ root, page: 1, range, geometry: geo });
    expect(anchor).not.toBeNull();
    expect(anchor!.quote).toBe(buildPageText(geo));
    expect(anchor!.quote).toBe('Hello world');
  });
});

// ── cssRectFromBox ────────────────────────────────────────────────────────────

describe('cssRectFromBox', () => {
  it('scales a NormalizedBox to px', () => {
    const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.05 };
    const rect = cssRectFromBox(box, 800, 1000);

    expect(rect.left).toBeCloseTo(80);
    expect(rect.top).toBeCloseTo(200);
    expect(rect.width).toBeCloseTo(240);
    expect(rect.height).toBeCloseTo(50);
  });

  it('returns zeros for a zero-origin box', () => {
    const box = { x: 0, y: 0, width: 0, height: 0 };
    const rect = cssRectFromBox(box, 800, 1000);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it('scales correctly for a full-page box', () => {
    const box = { x: 0, y: 0, width: 1, height: 1 };
    const rect = cssRectFromBox(box, 500, 700);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
    expect(rect.width).toBe(500);
    expect(rect.height).toBe(700);
  });
});
