/**
 * highlight-paint.test.ts — pure tests for buildSetAnnotationsMessage
 * (apps/mobile/src/reader/highlight-paint.ts).
 *
 * Verifies: emits one item per annotation with known geometry, skips annotations
 * whose page geometry is absent, carries id/page/kind/color + resolved boxes.
 */

import { describe, expect, it } from 'vitest';

import type { Annotation, PageTextGeometry } from '@ember/core';

import { buildSetAnnotationsMessage } from '../reader/highlight-paint.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GEO_PAGE1: PageTextGeometry = {
  pageNumber: 1,
  items: [
    { index: 0, str: 'Hello', box: { x: 0.1, y: 0.1, width: 0.3, height: 0.05 } },
    { index: 1, str: 'World', box: { x: 0.4, y: 0.1, width: 0.3, height: 0.05 } },
  ],
};

const GEO_PAGE2: PageTextGeometry = {
  pageNumber: 2,
  items: [
    { index: 0, str: 'Chapter', box: { x: 0.1, y: 0.05, width: 0.5, height: 0.06 } },
  ],
};

function makeAnnotation(overrides: Partial<Annotation> & { id: string }): Annotation {
  return {
    docId: 'doc-1',
    kind: 'highlight',
    anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' },
    color: 'yellow',
    createdAt: 1_000_000,
    updatedAt: 'hlc-001',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildSetAnnotationsMessage', () => {
  it('returns type:"setAnnotations" with an items array', () => {
    const msg = buildSetAnnotationsMessage([], new Map());
    expect(msg.type).toBe('setAnnotations');
    expect(Array.isArray(msg.items)).toBe(true);
  });

  it('emits one item per annotation whose page geometry is known', () => {
    const annotations = [
      makeAnnotation({ id: 'ann-1', anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' }, color: 'yellow' }),
      makeAnnotation({ id: 'ann-2', anchor: { kind: 'text', page: 2, startChar: 0, endChar: 7, quote: 'Chapter' }, color: 'green' }),
    ];
    const geometryByPage = new Map([[1, GEO_PAGE1], [2, GEO_PAGE2]]);

    const msg = buildSetAnnotationsMessage(annotations, geometryByPage);
    expect(msg.items).toHaveLength(2);
  });

  it('skips annotations whose page geometry is unknown', () => {
    const annotations = [
      makeAnnotation({ id: 'ann-1', anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' }, color: 'yellow' }),
      makeAnnotation({ id: 'ann-2', anchor: { kind: 'text', page: 99, startChar: 0, endChar: 5, quote: 'Nope' }, color: 'blue' }),
    ];
    // Only page 1 geometry provided
    const geometryByPage = new Map([[1, GEO_PAGE1]]);

    const msg = buildSetAnnotationsMessage(annotations, geometryByPage);
    expect(msg.items).toHaveLength(1);
    expect(msg.items[0]!.id).toBe('ann-1');
  });

  it('carries id, page, kind, color on each item', () => {
    const annotations = [
      makeAnnotation({ id: 'ann-xyz', anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' }, color: 'pink' }),
    ];
    const geometryByPage = new Map([[1, GEO_PAGE1]]);

    const msg = buildSetAnnotationsMessage(annotations, geometryByPage);
    expect(msg.items).toHaveLength(1);
    const item = msg.items[0]!;
    expect(item.id).toBe('ann-xyz');
    expect(item.page).toBe(1);
    expect(item.kind).toBe('highlight');
    expect(item.color).toBe('pink');
  });

  it('carries resolved boxes from resolveAnchorRects', () => {
    const annotations = [
      makeAnnotation({ id: 'ann-1', anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' }, color: 'yellow' }),
    ];
    const geometryByPage = new Map([[1, GEO_PAGE1]]);

    const msg = buildSetAnnotationsMessage(annotations, geometryByPage);
    expect(msg.items[0]!.boxes).toHaveLength(1);
    expect(msg.items[0]!.boxes[0]).toMatchObject({ x: 0.1, y: 0.1, width: 0.3, height: 0.05 });
  });

  it('items with zero resolved boxes are still emitted (boxes: [])', () => {
    // Geometry is empty — resolveAnchorRects returns []
    const emptyGeo: PageTextGeometry = { pageNumber: 1, items: [] };
    const annotations = [
      makeAnnotation({ id: 'ann-1', anchor: { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'Hello' }, color: 'yellow' }),
    ];
    const geometryByPage = new Map([[1, emptyGeo]]);

    const msg = buildSetAnnotationsMessage(annotations, geometryByPage);
    // Geometry is known (page 1 present) but empty → item emitted with boxes: []
    expect(msg.items).toHaveLength(1);
    expect(msg.items[0]!.boxes).toEqual([]);
  });

  it('returns items:[] when annotations list is empty', () => {
    const msg = buildSetAnnotationsMessage([], new Map([[1, GEO_PAGE1]]));
    expect(msg.items).toEqual([]);
  });
});
