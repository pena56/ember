/**
 * page-geometry.test.ts — Unit 05c-3 mobile text-geometry adapter tests.
 *
 * Tests are pure/headless — no WebView, no Expo runtime, no pdf.js worker.
 * The WebView half is validated device-side via app/dev/text-geometry-05c3.tsx.
 *
 * Golden fixture files live at apps/web/test-fixtures/ — resolved relative to
 * this test file using import.meta.url (ESM/vitest, no @types/node dependency).
 */

import { describe, expect, it } from 'vitest';

import type { PageTextGeometry } from '@ember/core';

import { geometryFromBridge, type RawGeometryMessage } from '../reader/page-geometry.js';

// ── Load golden fixtures (apps/web/test-fixtures — single source of truth) ───
// import.meta.url gives the absolute URL of this test file.
// Resolve the relative path to the web fixtures directory without @types/node.

const rawMsg = ((await import(
  new URL('../../../../apps/web/test-fixtures/raw-textcontent.json', import.meta.url).pathname,
  { with: { type: 'json' } }
)) as { default: RawGeometryMessage }).default;

const expectedGeometry = ((await import(
  new URL('../../../../apps/web/test-fixtures/expected-geometry.json', import.meta.url).pathname,
  { with: { type: 'json' } }
)) as { default: PageTextGeometry }).default;

// ── 1. Byte-for-byte golden parity ───────────────────────────────────────────

describe('geometryFromBridge — golden parity', () => {
  it('reproduces the committed web expected-geometry.json byte-for-byte from raw-textcontent.json', () => {
    const result = geometryFromBridge(rawMsg);
    expect(result).toEqual(expectedGeometry);
  });
});

// ── 2. TextMarkedContent filtering ───────────────────────────────────────────

describe('geometryFromBridge — TextMarkedContent filtering', () => {
  it('drops markers between real items; output count == real-item count; order + str preserved', () => {
    const msg: RawGeometryMessage = {
      pageNumber: 1,
      viewport: { width: 595, height: 842 },
      items: [
        // Real TextItem
        {
          str: 'First',
          dir: 'ltr',
          width: 30,
          height: 12,
          transform: [12, 0, 0, 12, 50, 700],
          fontName: 'f1',
          hasEOL: false,
        },
        // TextMarkedContent marker — must be dropped
        { type: 'beginMarkedContent', id: 'Span' },
        // Real TextItem
        {
          str: 'Second',
          dir: 'ltr',
          width: 36,
          height: 12,
          transform: [12, 0, 0, 12, 50, 600],
          fontName: 'f1',
          hasEOL: false,
        },
        // Another TextMarkedContent variant
        { type: 'endMarkedContent' },
        // Real TextItem
        {
          str: 'Third',
          dir: 'ltr',
          width: 30,
          height: 12,
          transform: [12, 0, 0, 12, 50, 500],
          fontName: 'f1',
          hasEOL: true,
        },
      ],
    };

    const result = geometryFromBridge(msg);

    // Markers dropped — only the 3 real TextItems remain
    expect(result.items).toHaveLength(3);

    // Contiguous indices 0..n-1
    expect(result.items.map((i) => i.index)).toEqual([0, 1, 2]);

    // Order and str preserved
    expect(result.items.map((i) => i.str)).toEqual(['First', 'Second', 'Third']);
  });
});

// ── 3. Faithful preservation of empty-str / hasEOL items ─────────────────────

describe('geometryFromBridge — faithful preservation', () => {
  it('keeps empty-str/hasEOL spacing items (does not drop them)', () => {
    const msg: RawGeometryMessage = {
      pageNumber: 2,
      viewport: { width: 595, height: 842 },
      items: [
        {
          str: 'Before',
          dir: 'ltr',
          width: 36,
          height: 12,
          transform: [12, 0, 0, 12, 50, 700],
          fontName: 'f1',
          hasEOL: false,
        },
        // Empty-str / hasEOL spacing item — must be kept
        {
          str: '',
          dir: 'ltr',
          width: 0,
          height: 12,
          transform: [12, 0, 0, 12, 86, 700],
          fontName: 'f1',
          hasEOL: true,
        },
        {
          str: 'After',
          dir: 'ltr',
          width: 30,
          height: 12,
          transform: [12, 0, 0, 12, 50, 680],
          fontName: 'f1',
          hasEOL: false,
        },
      ],
    };

    const result = geometryFromBridge(msg);

    // All 3 items kept (the empty-str spacing item is NOT dropped)
    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.str)).toEqual(['Before', '', 'After']);

    // The empty-str item has reading-order index 1
    const spacingItem = result.items[1];
    expect(spacingItem?.index).toBe(1);
    expect(spacingItem?.str).toBe('');
  });
});

// ── 4. Wiring: geometry message → PageTextGeometry (pure path, no WebView) ───

describe('geometryFromBridge — wiring: message → PageTextGeometry', () => {
  it('maps a geometry bridge message to the correct PageTextGeometry (pageNumber, str, normalized box)', () => {
    // Minimal one-item message (page 3, simple position)
    const msg: RawGeometryMessage = {
      pageNumber: 3,
      viewport: { width: 400, height: 600 },
      items: [
        {
          str: 'Test',
          dir: 'ltr',
          width: 80,   // 80 / 400 = 0.2 → box.width
          height: 10,  // 10 / 600 ≈ 0.0166 → box.height
          // transform: [a, b, c, d, e, f] — e=100(left), f=500(baseline)
          // topPdf = 600 - (500 + 10) = 90 → y = 90/600 = 0.15
          transform: [10, 0, 0, 10, 100, 500],
          fontName: 'f1',
          hasEOL: false,
        },
      ],
    };

    const result = geometryFromBridge(msg);

    expect(result.pageNumber).toBe(3);
    expect(result.items).toHaveLength(1);

    const item = result.items[0]!;
    expect(item.str).toBe('Test');
    expect(item.index).toBe(0);

    // Verify normalized box values (computed above)
    expect(item.box.x).toBeCloseTo(100 / 400);        // 0.25
    expect(item.box.y).toBeCloseTo(90 / 600);         // 0.15
    expect(item.box.width).toBeCloseTo(80 / 400);     // 0.2
    expect(item.box.height).toBeCloseTo(10 / 600);    // 0.01666...
  });
});
