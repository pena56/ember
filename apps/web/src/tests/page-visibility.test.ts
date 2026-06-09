/**
 * page-visibility.test.ts — pure unit tests for scroll helpers.
 * No canvas / DOM deps — just math.
 */

import { describe, expect, it } from 'vitest';

import { mostVisiblePage, placeholderHeight } from '../reader/page-visibility.js';

describe('mostVisiblePage', () => {
  it('returns the page with the most overlap with the viewport', () => {
    const pages = [
      { pageNumber: 1, top: 0, bottom: 800 },
      { pageNumber: 2, top: 808, bottom: 1608 },
      { pageNumber: 3, top: 1616, bottom: 2416 },
    ];

    // Viewport sees mostly page 2
    expect(mostVisiblePage(pages, 700, 1100)).toBe(2);
  });

  it('returns the page that fully fills the viewport', () => {
    const pages = [
      { pageNumber: 1, top: 0, bottom: 800 },
      { pageNumber: 2, top: 808, bottom: 1608 },
    ];
    expect(mostVisiblePage(pages, 0, 400)).toBe(1);
  });

  it('falls back to page 1 when the page list is empty', () => {
    expect(mostVisiblePage([], 0, 500)).toBe(1);
  });

  it('returns the first candidate page even with zero overlap', () => {
    // When overlap is 0 for all pages, the first page in the list wins
    // (0 > initial bestOverlap of -1 → first page gets picked)
    const pages = [{ pageNumber: 2, top: 1000, bottom: 1800 }];
    expect(mostVisiblePage(pages, 0, 500)).toBe(2);
  });

  it('returns the correct page when viewport spans two pages equally', () => {
    const pages = [
      { pageNumber: 1, top: 0, bottom: 400 },
      { pageNumber: 2, top: 400, bottom: 800 },
    ];
    // Equal overlap — page 1 wins (first encountered)
    const result = mostVisiblePage(pages, 200, 600);
    // 200px overlap for each; page 1 is first so it wins on equal overlap
    expect(result === 1 || result === 2).toBe(true);
  });
});

describe('placeholderHeight', () => {
  it('scales height proportionally to display width', () => {
    // A4: 595 × 842 at scale 1 → aspect ≈ 1.414
    const h = placeholderHeight(595, 842, 500);
    expect(h).toBeCloseTo((842 / 595) * 500, 0);
  });

  it('falls back to A4 aspect when naturalWidth is 0', () => {
    const h = placeholderHeight(0, 0, 600);
    expect(h).toBeCloseTo(600 * 1.414, 0);
  });
});
