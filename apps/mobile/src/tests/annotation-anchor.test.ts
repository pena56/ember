/**
 * annotation-anchor.test.ts — pure-helper tests for anchorFromSelection
 * and boxesForAnnotation (apps/mobile/src/reader/annotation-anchor.ts).
 *
 * Feed hand-built PageTextGeometry (no pdf.js, no DOM, no device).
 * Mirrors web's selection-anchor.test.ts spirit.
 */

import { describe, expect, it } from 'vitest';

import type { Annotation, PageTextGeometry } from '@ember/core';

import { anchorFromSelection, boxesForAnnotation } from '../reader/annotation-anchor.js';

// ── Fixture ───────────────────────────────────────────────────────────────────

/**
 * A minimal PageTextGeometry with three text runs:
 *   "Hello" (chars 0-5), "World" (chars 5-10), "!" (chars 10-11)
 * Boxes are simple normalized fractions (0..1) of a 100×100 page.
 */
const GEO: PageTextGeometry = {
  pageNumber: 1,
  items: [
    { index: 0, str: 'Hello', box: { x: 0.1, y: 0.1, width: 0.3, height: 0.05 } },
    { index: 1, str: 'World', box: { x: 0.4, y: 0.1, width: 0.3, height: 0.05 } },
    { index: 2, str: '!',     box: { x: 0.7, y: 0.1, width: 0.05, height: 0.05 } },
  ],
};

// ── anchorFromSelection ────────────────────────────────────────────────────────

describe('anchorFromSelection', () => {
  it('returns a TextAnchor with quote derived from buildPageText().slice', () => {
    const anchor = anchorFromSelection({ page: 1, startChar: 0, endChar: 5, geometry: GEO });
    expect(anchor).not.toBeNull();
    expect(anchor!.kind).toBe('text');
    expect(anchor!.page).toBe(1);
    expect(anchor!.startChar).toBe(0);
    expect(anchor!.endChar).toBe(5);
    expect(anchor!.quote).toBe('Hello'); // buildPageText slices "HelloWorld!" → "Hello"
  });

  it('returns null when startChar === endChar (empty range)', () => {
    const anchor = anchorFromSelection({ page: 1, startChar: 3, endChar: 3, geometry: GEO });
    expect(anchor).toBeNull();
  });

  it('order-normalizes reversed ranges (endChar < startChar)', () => {
    // Reversed: start=10, end=5 → should normalise to sc=5, ec=10
    const anchor = anchorFromSelection({ page: 1, startChar: 10, endChar: 5, geometry: GEO });
    expect(anchor).not.toBeNull();
    expect(anchor!.startChar).toBe(5);
    expect(anchor!.endChar).toBe(10);
    expect(anchor!.quote).toBe('World');
  });

  it('derives the quote spanning multiple runs', () => {
    // chars 5..10 = "World", but also 0..10 = "HelloWorld"
    const anchor = anchorFromSelection({ page: 1, startChar: 0, endChar: 10, geometry: GEO });
    expect(anchor).not.toBeNull();
    expect(anchor!.quote).toBe('HelloWorld');
  });

  it('uses the provided page number in the anchor', () => {
    const anchor = anchorFromSelection({ page: 3, startChar: 0, endChar: 5, geometry: GEO });
    expect(anchor).not.toBeNull();
    expect(anchor!.page).toBe(3);
  });

  it('returns null when start equals end after order-normalisation (equal pair)', () => {
    const anchor = anchorFromSelection({ page: 1, startChar: 5, endChar: 5, geometry: GEO });
    expect(anchor).toBeNull();
  });
});

// ── boxesForAnnotation ────────────────────────────────────────────────────────

describe('boxesForAnnotation', () => {
  const BASE_ANNOTATION: Annotation = {
    id: 'ann-1',
    docId: 'doc-1',
    kind: 'highlight',
    anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' },
    color: 'yellow',
    createdAt: 1_000_000,
    updatedAt: 'hlc-001',
  };

  it('returns resolved boxes for a valid annotation + geometry', () => {
    const boxes = boxesForAnnotation(BASE_ANNOTATION, GEO);
    // "Hello" is entirely in item[0] — expect one box matching that item's box
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ x: 0.1, y: 0.1, width: 0.3, height: 0.05 });
  });

  it('returns boxes spanning multiple items for a multi-run selection', () => {
    const ann: Annotation = {
      ...BASE_ANNOTATION,
      anchor: { kind: 'text', page: 1, startChar: 0, endChar: 10, quote: 'HelloWorld' },
    };
    const boxes = boxesForAnnotation(ann, GEO);
    expect(boxes).toHaveLength(2); // "Hello" box + "World" box
  });

  it('returns [] when the anchor range is empty', () => {
    const ann: Annotation = {
      ...BASE_ANNOTATION,
      anchor: { kind: 'text', page: 1, startChar: 5, endChar: 5, quote: '' },
    };
    const boxes = boxesForAnnotation(ann, GEO);
    expect(boxes).toEqual([]);
  });

  it('returns [] when geometry is empty', () => {
    const emptyGeo: PageTextGeometry = { pageNumber: 1, items: [] };
    const boxes = boxesForAnnotation(BASE_ANNOTATION, emptyGeo);
    expect(boxes).toEqual([]);
  });
});
