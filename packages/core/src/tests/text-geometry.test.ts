import { describe, expect, it } from 'vitest';

import { normalizePageText } from '../text-geometry.js';
import type { RawPageViewport, RawTextItem } from '../text-geometry.js';

// Helper to build a minimal RawTextItem.
function makeItem(str: string, x: number, y: number, w: number, h: number): RawTextItem {
  // transform = [a, b, c, d, e, f] — for non-rotated text: e=left, f=baseline in PDF user space.
  return { str, width: w, height: h, transform: [1, 0, 0, 1, x, y] };
}

describe('normalizePageText', () => {
  // Viewport: 500 wide × 800 tall (PDF user space).
  const vp: RawPageViewport = { width: 500, height: 800 };

  it('returns the correct pageNumber', () => {
    const result = normalizePageText(3, vp, []);
    expect(result.pageNumber).toBe(3);
  });

  it('returns empty items array when rawItems is empty', () => {
    const result = normalizePageText(1, vp, []);
    expect(result.items).toEqual([]);
  });

  // A run near the bottom-left of the page (small f / baseline) should map to y≈1 in top-left space.
  it('run at bottom-left (small baseline) normalizes to y near 1', () => {
    // baseline = 10, height = 20 → topPdf = 800 - (10 + 20) = 770 → y = 770/800 = 0.9625
    const item = makeItem('bottom', 0, 10, 50, 20);
    const result = normalizePageText(1, vp, [item]);
    const box = result.items[0]!.box;
    expect(box.y).toBeCloseTo(0.9625, 8);
  });

  // A run near the top of the page (large f / baseline) should map to y≈0.
  it('run near top (large baseline) normalizes to y near 0', () => {
    // baseline = 760, height = 20 → topPdf = 800 - (760 + 20) = 20 → y = 20/800 = 0.025
    const item = makeItem('top', 0, 760, 50, 20);
    const result = normalizePageText(1, vp, [item]);
    const box = result.items[0]!.box;
    expect(box.y).toBeCloseTo(0.025, 8);
  });

  // Width/height normalize to the correct fractions.
  it('a 100-wide run on a 500-wide page → box.width === 0.2', () => {
    const item = makeItem('narrow', 0, 100, 100, 40);
    const result = normalizePageText(1, vp, [item]);
    expect(result.items[0]!.box.width).toBeCloseTo(0.2, 10);
  });

  it('box.height is the correct fraction of page height', () => {
    // height 80 on 800-tall page → 0.1
    const item = makeItem('tall', 0, 100, 100, 80);
    const result = normalizePageText(1, vp, [item]);
    expect(result.items[0]!.box.height).toBeCloseTo(0.1, 10);
  });

  it('box.x is normalized by page width', () => {
    // left = 250 on 500-wide page → x = 0.5
    const item = makeItem('mid', 250, 100, 50, 20);
    const result = normalizePageText(1, vp, [item]);
    expect(result.items[0]!.box.x).toBeCloseTo(0.5, 10);
  });

  // index reflects input order.
  it('index reflects input order', () => {
    const items = [
      makeItem('first', 0, 100, 50, 20),
      makeItem('second', 60, 100, 50, 20),
      makeItem('third', 120, 100, 50, 20),
    ];
    const result = normalizePageText(1, vp, items);
    expect(result.items.map((i) => i.index)).toEqual([0, 1, 2]);
  });

  // str is preserved exactly, including an empty-string spacing item.
  it('str is preserved verbatim, including empty string', () => {
    const items = [
      makeItem('hello', 0, 100, 50, 20),
      makeItem('', 60, 100, 5, 20), // spacing/EOL item
      makeItem('world', 70, 100, 50, 20),
    ];
    const result = normalizePageText(1, vp, items);
    expect(result.items.map((i) => i.str)).toEqual(['hello', '', 'world']);
  });

  // All items (incl. empty str) are preserved in output.
  it('all items are preserved (including empty/spacing items)', () => {
    const items = [
      makeItem('a', 0, 100, 10, 10),
      makeItem('', 15, 100, 5, 10),
      makeItem('b', 25, 100, 10, 10),
    ];
    const result = normalizePageText(1, vp, items);
    expect(result.items).toHaveLength(3);
  });

  // Coordinate independence: scaling the viewport and items by the same factor yields identical boxes.
  it('scale independence — same normalized boxes regardless of render scale', () => {
    const scale = 2;
    const vp2: RawPageViewport = { width: vp.width * scale, height: vp.height * scale };

    const rawItem1 = makeItem('text', 100, 200, 80, 30);
    const rawItem2 = makeItem('text', 100 * scale, 200 * scale, 80 * scale, 30 * scale);

    const r1 = normalizePageText(1, vp, [rawItem1]);
    const r2 = normalizePageText(1, vp2, [rawItem2]);

    const b1 = r1.items[0]!.box;
    const b2 = r2.items[0]!.box;
    expect(b1.x).toBeCloseTo(b2.x, 10);
    expect(b1.y).toBeCloseTo(b2.y, 10);
    expect(b1.width).toBeCloseTo(b2.width, 10);
    expect(b1.height).toBeCloseTo(b2.height, 10);
  });

  // Zero-dimension viewport → zeroed boxes, no NaN/Infinity.
  it('zero-width viewport → zeroed boxes (no NaN/Infinity)', () => {
    const zeroVp: RawPageViewport = { width: 0, height: 800 };
    const item = makeItem('x', 100, 200, 50, 20);
    const result = normalizePageText(1, zeroVp, [item]);
    const box = result.items[0]!.box;
    expect(box.x).toBe(0);
    expect(box.width).toBe(0);
    expect(Number.isFinite(box.y)).toBe(true);
    expect(Number.isNaN(box.x)).toBe(false);
    expect(Number.isNaN(box.width)).toBe(false);
  });

  it('zero-height viewport → zeroed boxes (no NaN/Infinity)', () => {
    const zeroVp: RawPageViewport = { width: 500, height: 0 };
    const item = makeItem('x', 100, 200, 50, 20);
    const result = normalizePageText(1, zeroVp, [item]);
    const box = result.items[0]!.box;
    expect(box.y).toBe(0);
    expect(box.height).toBe(0);
    expect(Number.isFinite(box.x)).toBe(true);
    expect(Number.isNaN(box.y)).toBe(false);
    expect(Number.isNaN(box.height)).toBe(false);
  });

  it('zero-width AND zero-height viewport → fully zeroed boxes', () => {
    const zeroVp: RawPageViewport = { width: 0, height: 0 };
    const item = makeItem('x', 100, 200, 50, 20);
    const result = normalizePageText(1, zeroVp, [item]);
    const box = result.items[0]!.box;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(0);
    expect(box.height).toBe(0);
  });

  // Sanity: full round-trip box values for a concrete fixture.
  it('full fixture — concrete expected box values', () => {
    // vp: 500×800; item: left=50, baseline=200, w=100, h=40
    // topPdf = 800 - (200 + 40) = 560
    // x = 50/500 = 0.1, y = 560/800 = 0.7, width = 100/500 = 0.2, height = 40/800 = 0.05
    const item = makeItem('fixture', 50, 200, 100, 40);
    const result = normalizePageText(1, vp, [item]);
    const it0 = result.items[0]!;
    expect(it0.box).toEqual({ x: 0.1, y: 0.7, width: 0.2, height: 0.05 });
    expect(it0.str).toBe('fixture');
    expect(it0.index).toBe(0);
  });
});
