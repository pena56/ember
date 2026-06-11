/**
 * reading-position.test.ts — pure geometry helpers (no DOM, no React).
 *
 * Tests computePageOffset and resumeScrollTop from reading-position.ts.
 * jsdom has no layout so all offset math is exercised headlessly here.
 */

import { describe, expect, it } from 'vitest';

import { computePageOffset, resumeScrollTop } from './reading-position.js';

// ── computePageOffset ─────────────────────────────────────────────────────────

describe('computePageOffset', () => {
  it('top of page → 0 (viewportTop === pageTop)', () => {
    expect(computePageOffset({ pageTop: 100, pageHeight: 800, viewportTop: 100 })).toBe(0);
  });

  it('fully past page → 1 (viewportTop === pageTop + pageHeight)', () => {
    expect(computePageOffset({ pageTop: 0, pageHeight: 800, viewportTop: 800 })).toBe(1);
  });

  it('mid-page fraction is correct', () => {
    // viewportTop 400 into page at top=0, height=800 → 0.5
    expect(computePageOffset({ pageTop: 0, pageHeight: 800, viewportTop: 400 })).toBeCloseTo(0.5);
  });

  it('clamps to 0 when viewportTop is above the page (negative result)', () => {
    // viewportTop 50, pageTop 100 → (50-100)/800 = -0.0625 → clamped to 0
    expect(computePageOffset({ pageTop: 100, pageHeight: 800, viewportTop: 50 })).toBe(0);
  });

  it('clamps to 1 when viewportTop is below the page (>1 result)', () => {
    // viewportTop 900, pageTop 0, height 800 → 900/800 = 1.125 → clamped to 1
    expect(computePageOffset({ pageTop: 0, pageHeight: 800, viewportTop: 900 })).toBe(1);
  });

  it('pageHeight <= 0 → 0 (guard against divide-by-zero)', () => {
    expect(computePageOffset({ pageTop: 0, pageHeight: 0, viewportTop: 50 })).toBe(0);
    expect(computePageOffset({ pageTop: 0, pageHeight: -5, viewportTop: 50 })).toBe(0);
  });
});

// ── resumeScrollTop ───────────────────────────────────────────────────────────

describe('resumeScrollTop', () => {
  it('offset 0 → pageOffsetTop (scroll to top of page)', () => {
    expect(resumeScrollTop({ pageOffsetTop: 200, pageHeight: 800, offset: 0 })).toBe(200);
  });

  it('offset 1 → pageOffsetTop + pageHeight (scroll to bottom of page)', () => {
    expect(resumeScrollTop({ pageOffsetTop: 200, pageHeight: 800, offset: 1 })).toBe(1000);
  });

  it('mid fraction is correct', () => {
    // pageOffsetTop=200, pageHeight=800, offset=0.5 → 200 + 0.5*800 = 600
    expect(resumeScrollTop({ pageOffsetTop: 200, pageHeight: 800, offset: 0.5 })).toBeCloseTo(600);
  });

  it('offset below 0 is clamped to 0 → returns pageOffsetTop', () => {
    expect(resumeScrollTop({ pageOffsetTop: 200, pageHeight: 800, offset: -0.5 })).toBe(200);
  });

  it('offset above 1 is clamped to 1 → returns pageOffsetTop + pageHeight', () => {
    expect(resumeScrollTop({ pageOffsetTop: 200, pageHeight: 800, offset: 1.5 })).toBe(1000);
  });
});
