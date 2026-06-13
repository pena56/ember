import { describe, expect, it } from 'vitest';

import { buildPageText, resolveAnchorRects } from '../anchor-resolver.js';
import type { TextAnchor } from '../annotation.js';
import type { PageTextGeometry, TextItemGeometry } from '../text-geometry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(index: number, str: string, x: number, y: number, width: number, height: number): TextItemGeometry {
  return { index, str, box: { x, y, width, height } };
}

function makeGeometry(items: TextItemGeometry[]): PageTextGeometry {
  return { pageNumber: 1, items };
}

function makeAnchor(startChar: number, endChar: number): TextAnchor {
  return { kind: 'text', page: 1, startChar, endChar, quote: '' };
}

// ---------------------------------------------------------------------------
// buildPageText
// ---------------------------------------------------------------------------

describe('buildPageText', () => {
  it('concatenates item strings in index order with no separator', () => {
    const geom = makeGeometry([
      makeItem(0, 'Hello', 0, 0, 0.5, 0.1),
      makeItem(1, ' world', 0.5, 0, 0.5, 0.1),
    ]);
    expect(buildPageText(geom)).toBe('Hello world');
  });

  it('returns empty string for empty geometry', () => {
    const geom = makeGeometry([]);
    expect(buildPageText(geom)).toBe('');
  });

  it('empty spacing item contributes no characters (no separator added)', () => {
    const geom = makeGeometry([
      makeItem(0, 'foo', 0, 0, 0.3, 0.1),
      makeItem(1, '', 0.3, 0, 0, 0.1), // spacing item
      makeItem(2, 'bar', 0.3, 0, 0.3, 0.1),
    ]);
    expect(buildPageText(geom)).toBe('foobar');
  });

  it('concatenates items in index order (not array order if reordered)', () => {
    // Items already have index 0, 1, 2 matching array order — confirm no separator
    const geom = makeGeometry([
      makeItem(0, 'A', 0, 0, 0.1, 0.1),
      makeItem(1, 'B', 0.1, 0, 0.1, 0.1),
      makeItem(2, 'C', 0.2, 0, 0.1, 0.1),
    ]);
    expect(buildPageText(geom)).toBe('ABC');
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorRects — basic guards
// ---------------------------------------------------------------------------

describe('resolveAnchorRects — guards', () => {
  it('returns [] for empty geometry', () => {
    const geom = makeGeometry([]);
    expect(resolveAnchorRects(makeAnchor(0, 5), geom)).toEqual([]);
  });

  it('returns [] when startChar >= endChar (equal)', () => {
    const geom = makeGeometry([makeItem(0, 'hello', 0, 0, 0.5, 0.1)]);
    expect(resolveAnchorRects(makeAnchor(3, 3), geom)).toEqual([]);
  });

  it('returns [] when startChar >= endChar (inverted)', () => {
    const geom = makeGeometry([makeItem(0, 'hello', 0, 0, 0.5, 0.1)]);
    expect(resolveAnchorRects(makeAnchor(5, 2), geom)).toEqual([]);
  });

  it('returns [] when anchor is entirely out of range', () => {
    const geom = makeGeometry([makeItem(0, 'hi', 0, 0, 0.2, 0.1)]);
    // text is 2 chars; startChar >= endChar after clamp to [0,2]
    expect(resolveAnchorRects(makeAnchor(5, 10), geom)).toEqual([]);
  });

  it('clamps to text length and still resolves partial overlap', () => {
    // text = "hello" (5 chars); anchor [3, 100) → clamped to [3, 5)
    const geom = makeGeometry([makeItem(0, 'hello', 0, 0.0, 0.5, 0.1)]);
    const rects = resolveAnchorRects(makeAnchor(3, 100), geom);
    expect(rects).toHaveLength(1);
    // chars 3..5 out of 5 total → frac0=3/5, frac1=5/5=1 → x=0+0.6*0.5=0.3, width=(1-0.6)*0.5=0.2
    expect(rects[0]!.x).toBeCloseTo(0.3, 10);
    expect(rects[0]!.width).toBeCloseTo(0.2, 10);
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorRects — single item, full cover
// ---------------------------------------------------------------------------

describe('resolveAnchorRects — single item full cover', () => {
  it('emits the item box unchanged when fully covered', () => {
    // "hello" = 5 chars; anchor [0, 5) covers entire item
    const box = { x: 0.1, y: 0.2, width: 0.4, height: 0.05 };
    const geom = makeGeometry([{ index: 0, str: 'hello', box }]);
    const rects = resolveAnchorRects(makeAnchor(0, 5), geom);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual(box);
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorRects — single item, partial cover
// ---------------------------------------------------------------------------

describe('resolveAnchorRects — partial cover uniform advance', () => {
  it('computes correct horizontal sub-slice for a partial selection', () => {
    // item: "abcde" (5 chars), box x=0.0, width=1.0, y=0.1, height=0.2
    // anchor: [1, 4) → chars 'bcd'
    // frac0 = 1/5 = 0.2, frac1 = 4/5 = 0.8
    // x = 0.0 + 0.2*1.0 = 0.2, width = (0.8-0.2)*1.0 = 0.6; y/height unchanged
    const geom = makeGeometry([
      makeItem(0, 'abcde', 0.0, 0.1, 1.0, 0.2),
    ]);
    const rects = resolveAnchorRects(makeAnchor(1, 4), geom);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.x).toBeCloseTo(0.2, 10);
    expect(rects[0]!.width).toBeCloseTo(0.6, 10);
    expect(rects[0]!.y).toBeCloseTo(0.1, 10);
    expect(rects[0]!.height).toBeCloseTo(0.2, 10);
  });

  it('handles selection starting at first char (partial right)', () => {
    // "hello" 5 chars, box x=0, y=0, w=0.5, h=0.1
    // anchor [0, 3) → frac0=0, frac1=3/5=0.6 → x=0, width=0.3
    const geom = makeGeometry([makeItem(0, 'hello', 0, 0, 0.5, 0.1)]);
    const rects = resolveAnchorRects(makeAnchor(0, 3), geom);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.x).toBeCloseTo(0.0, 10);
    expect(rects[0]!.width).toBeCloseTo(0.3, 10);
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorRects — multi-item span
// ---------------------------------------------------------------------------

describe('resolveAnchorRects — multi-item span', () => {
  it('emits one box per overlapped item for a 3-item selection (partial, full, partial)', () => {
    // item0: "Hello " (6 chars), item1: "beautiful " (10 chars), item2: "world" (5 chars)
    // full text: "Hello beautiful world" (21 chars)
    // anchor: [4, 17) → "o bea...l wo" (crosses all 3 items)
    // item0: [0,6) → overlap [4,6): partial; frac0=4/6, frac1=6/6=1
    // item1: [6,16) → overlap [6,16): full
    // item2: [16,21) → overlap [16,17): partial; frac0=0/5, frac1=1/5
    const geom = makeGeometry([
      makeItem(0, 'Hello ', 0.0, 0.0, 0.3, 0.1),
      makeItem(1, 'beautiful ', 0.3, 0.1, 0.5, 0.1),
      makeItem(2, 'world', 0.8, 0.2, 0.2, 0.1),
    ]);
    const rects = resolveAnchorRects(makeAnchor(4, 17), geom);
    expect(rects).toHaveLength(3);

    // item0 partial: frac0=4/6, frac1=1.0 → x=0+4/6*0.3=0.2, width=(1-4/6)*0.3=2/6*0.3=0.1
    expect(rects[0]!.x).toBeCloseTo(0 + (4 / 6) * 0.3, 10);
    expect(rects[0]!.width).toBeCloseTo((2 / 6) * 0.3, 10);
    expect(rects[0]!.y).toBeCloseTo(0.0, 10);
    expect(rects[0]!.height).toBeCloseTo(0.1, 10);

    // item1 full: box unchanged
    expect(rects[1]).toEqual({ x: 0.3, y: 0.1, width: 0.5, height: 0.1 });

    // item2 partial: frac0=0, frac1=1/5 → x=0.8, width=1/5*0.2=0.04
    expect(rects[2]!.x).toBeCloseTo(0.8, 10);
    expect(rects[2]!.width).toBeCloseTo((1 / 5) * 0.2, 10);
    expect(rects[2]!.y).toBeCloseTo(0.2, 10);
    expect(rects[2]!.height).toBeCloseTo(0.1, 10);
  });

  it('emits two boxes for a 2-item selection', () => {
    // item0: "abc" (3 chars), item1: "def" (3 chars)
    // anchor [0, 6) → both fully covered
    const geom = makeGeometry([
      makeItem(0, 'abc', 0.0, 0.0, 0.3, 0.1),
      makeItem(1, 'def', 0.3, 0.0, 0.3, 0.1),
    ]);
    const rects = resolveAnchorRects(makeAnchor(0, 6), geom);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0.0, y: 0.0, width: 0.3, height: 0.1 });
    expect(rects[1]).toEqual({ x: 0.3, y: 0.0, width: 0.3, height: 0.1 });
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorRects — zero-length / zero-width items
// ---------------------------------------------------------------------------

describe('resolveAnchorRects — zero-length and zero-width items', () => {
  it('skips empty-string items (spacing items) — no rect, no char accounting shift', () => {
    // item0: "foo" (3 chars), item1: "" (0 chars, spacing), item2: "bar" (3 chars)
    // full text: "foobar" (6 chars)
    // anchor [0, 6) → item0 full + item1 skipped + item2 full
    const geom = makeGeometry([
      makeItem(0, 'foo', 0.0, 0.0, 0.3, 0.1),
      makeItem(1, '', 0.3, 0.0, 0.0, 0.1), // spacing item
      makeItem(2, 'bar', 0.3, 0.1, 0.3, 0.1),
    ]);
    const rects = resolveAnchorRects(makeAnchor(0, 6), geom);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0.0, y: 0.0, width: 0.3, height: 0.1 });
    expect(rects[1]).toEqual({ x: 0.3, y: 0.1, width: 0.3, height: 0.1 });
  });

  it('skips zero-width items even if they have text', () => {
    // A zero-width item contributes chars to the index but emits no rect
    const geom = makeGeometry([
      makeItem(0, 'hello', 0.0, 0.0, 0.0, 0.1), // zero width
      makeItem(1, 'world', 0.1, 0.0, 0.4, 0.1),
    ]);
    // anchor [0, 5) covers only item0 (zero-width) → no rect emitted
    const rects = resolveAnchorRects(makeAnchor(0, 5), geom);
    expect(rects).toHaveLength(0);
  });

  it('no NaN in output boxes', () => {
    const geom = makeGeometry([
      makeItem(0, 'test', 0.1, 0.1, 0.4, 0.1),
    ]);
    const rects = resolveAnchorRects(makeAnchor(1, 3), geom);
    for (const r of rects) {
      expect(Number.isNaN(r.x)).toBe(false);
      expect(Number.isNaN(r.width)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorRects — purity
// ---------------------------------------------------------------------------

describe('resolveAnchorRects — purity', () => {
  it('does not mutate the geometry input', () => {
    const geom = makeGeometry([
      makeItem(0, 'immutable', 0.1, 0.2, 0.5, 0.1),
    ]);
    const snapshot = JSON.parse(JSON.stringify(geom)) as PageTextGeometry;
    resolveAnchorRects(makeAnchor(0, 9), geom);
    expect(geom).toEqual(snapshot);
  });
});
