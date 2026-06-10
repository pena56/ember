/**
 * page-geometry.test.ts — adapter tests for extractPageGeometry.
 *
 * PURE: reads committed JSON fixtures via import; NO pdf.js runtime.
 *
 * Test structure:
 * 1. Golden snapshot: runs the adapter against raw-textcontent.json and asserts
 *    it equals expected-geometry.json. This is the regression lock + the artifact
 *    05c-3 diffs against byte-for-byte.
 *
 * 2. Independent hand-computed spot-checks: for each known text run, we compute
 *    the expected box from scratch (x=transform[4]/vw, y=(vh-transform[5]-h)/vh,
 *    etc.) and assert the adapter output matches. These validate the GOLDEN ITSELF
 *    — they are NOT tautological against the generator and confirm the y-flip is
 *    real (top run → small y, bottom run → large y).
 *
 * 3. TextMarkedContent filtering: output item count equals the TextItem count in
 *    raw (strictly fewer than raw.items.length if markers are present); indices
 *    are contiguous 0..n-1.
 *
 * 4. Preservation: every kept item's str and order matches raw; pageNumber===1.
 *
 * NOTE — tautology guard: the golden snapshot alone only catches regressions.
 * The spot-checks in section 2 pin the correctness of the golden itself, combined
 * with 05c-1's hand-verified core normalizer math.
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import type { PageTextGeometry } from '@ember/core';

import { extractPageGeometry } from './page-geometry.js';

// ── Load committed fixtures ────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
// Fixtures live at apps/web/test-fixtures/ (two levels up from src/reader/)
const fixtureDir = resolve(__dirname, '../../test-fixtures');

const raw = JSON.parse(readFileSync(resolve(fixtureDir, 'raw-textcontent.json'), 'utf8')) as {
  pageNumber: number;
  viewport: { width: number; height: number };
  items: Array<Record<string, unknown>>;
};

const expected = JSON.parse(
  readFileSync(resolve(fixtureDir, 'expected-geometry.json'), 'utf8'),
) as PageTextGeometry;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count items from raw that are TextItems (have a 'transform' field). */
function rawTextItemCount(items: Array<Record<string, unknown>>): number {
  return items.filter((it) => 'transform' in it).length;
}

// ── 1. Golden snapshot ────────────────────────────────────────────────────────

describe('extractPageGeometry — golden snapshot', () => {
  it('produces output equal to the committed expected-geometry.json', () => {
    const result = extractPageGeometry(raw.pageNumber, raw.viewport, raw as never);
    expect(result).toEqual(expected);
  });
});

// ── 2. Independent hand-computed spot-checks ──────────────────────────────────
// These validate the golden — NOT just its self-consistency against the generator.

describe('extractPageGeometry — hand-computed spot-checks', () => {
  const vw = raw.viewport.width;   // 595
  const vh = raw.viewport.height;  // 842

  // Retrieve computed geometry once
  const result = extractPageGeometry(raw.pageNumber, raw.viewport, raw as never);

  it('pageNumber is 1', () => {
    expect(result.pageNumber).toBe(1);
  });

  it('item 0 (Hello Top) has correct normalized box — including small y (near top)', () => {
    // raw item 0: transform=[12,0,0,12,50,780], height=12, width=51.348
    const item = result.items[0];
    expect(item).toBeDefined();

    const transform = [12, 0, 0, 12, 50, 780] as const;
    const itemWidth = 51.34799999999999;
    const itemHeight = 12;

    const expectedX = transform[4] / vw;
    const topPdf = vh - (transform[5] + itemHeight);
    const expectedY = topPdf / vh;
    const expectedW = itemWidth / vw;
    const expectedH = itemHeight / vh;

    expect(item!.box.x).toBeCloseTo(expectedX, 10);
    expect(item!.box.y).toBeCloseTo(expectedY, 10);
    expect(item!.box.width).toBeCloseTo(expectedW, 10);
    expect(item!.box.height).toBeCloseTo(expectedH, 10);

    // y should be small (near top of page in top-left-origin coordinates)
    expect(item!.box.y).toBeLessThan(0.2);
    expect(item!.str).toBe('Hello Top');
  });

  it('item 1 (Hello Bottom) has correct normalized box — including large y (near bottom)', () => {
    // raw item 1: transform=[12,0,0,12,50,80], height=12, width=68.688
    const item = result.items[1];
    expect(item).toBeDefined();

    const transform = [12, 0, 0, 12, 50, 80] as const;
    const itemWidth = 68.68799999999999;
    const itemHeight = 12;

    const expectedX = transform[4] / vw;
    const topPdf = vh - (transform[5] + itemHeight);
    const expectedY = topPdf / vh;
    const expectedW = itemWidth / vw;
    const expectedH = itemHeight / vh;

    expect(item!.box.x).toBeCloseTo(expectedX, 10);
    expect(item!.box.y).toBeCloseTo(expectedY, 10);
    expect(item!.box.width).toBeCloseTo(expectedW, 10);
    expect(item!.box.height).toBeCloseTo(expectedH, 10);

    // y should be large (near bottom of page in top-left-origin coordinates)
    expect(item!.box.y).toBeGreaterThan(0.8);
    expect(item!.str).toBe('Hello Bottom');
  });

  it('top run has smaller y than bottom run (y-flip is correct)', () => {
    const topItem = result.items[0]!;
    const bottomItem = result.items[1]!;
    expect(topItem.box.y).toBeLessThan(bottomItem.box.y);
  });
});

// ── 3. TextMarkedContent filtering ───────────────────────────────────────────

describe('extractPageGeometry — TextMarkedContent filtering', () => {
  it('output item count equals the number of TextItems in raw', () => {
    const result = extractPageGeometry(raw.pageNumber, raw.viewport, raw as never);
    const expectedCount = rawTextItemCount(raw.items);
    expect(result.items).toHaveLength(expectedCount);
  });

  it('output indices are contiguous 0..n-1', () => {
    const result = extractPageGeometry(raw.pageNumber, raw.viewport, raw as never);
    result.items.forEach((item, i) => {
      expect(item.index).toBe(i);
    });
  });
});

// ── 4. Preservation ───────────────────────────────────────────────────────────

describe('extractPageGeometry — str and order preservation', () => {
  it('every kept item str matches the corresponding TextItem from raw, in order', () => {
    const result = extractPageGeometry(raw.pageNumber, raw.viewport, raw as never);
    const rawTextItems = raw.items.filter((it) => 'transform' in it);

    expect(result.items).toHaveLength(rawTextItems.length);
    result.items.forEach((item, i) => {
      expect(item.str).toBe((rawTextItems[i] as { str: string }).str);
    });
  });
});
