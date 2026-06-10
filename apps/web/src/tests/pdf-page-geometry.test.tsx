/**
 * pdf-page-geometry.test.tsx — wiring test for the onTextGeometry callback on PdfPage.
 *
 * Mirrors the reader-page.test.tsx jsdom mock pattern: mock pdfjs-dist (no canvas/worker
 * in jsdom) and assert that onTextGeometry fires with the correct PageTextGeometry shape
 * when PdfPage is mounted with active=true.
 *
 * The fake page returns a single text item at a known position; we hand-compute the
 * expected box and assert it matches what extractPageGeometry produces.
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageTextGeometry } from '@ember/core';

import { PdfPage } from '../reader/pdf-page.js';

// ── Mock pdfjs-dist (same pattern as reader-page.test.tsx) ────────────────────

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn().mockImplementation(() => ({
    render: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  })),
}));

// ── Fake pdf.js proxy ─────────────────────────────────────────────────────────

// Known item: str="Test", transform=[1,0,0,1,100,200], width=50, height=10
// Viewport scale=1: 400×600
// Expected box:
//   x = 100/400 = 0.25
//   topPdf = 600 - (200 + 10) = 390
//   y = 390/600 = 0.65
//   width = 50/400 = 0.125
//   height = 10/600 ≈ 0.016667
const FAKE_VP_WIDTH = 400;
const FAKE_VP_HEIGHT = 600;
const FAKE_ITEM_STR = 'Test';
const FAKE_TRANSFORM = [1, 0, 0, 1, 100, 200] as const;
const FAKE_ITEM_WIDTH = 50;
const FAKE_ITEM_HEIGHT = 10;

function makeFakePageHandle() {
  return {
    pageNumber: 1,
    getViewport: ({ scale }: { scale: number }) => ({
      width: FAKE_VP_WIDTH * scale,
      height: FAKE_VP_HEIGHT * scale,
      scale,
    }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent: () =>
      Promise.resolve({
        items: [
          {
            str: FAKE_ITEM_STR,
            dir: 'ltr',
            width: FAKE_ITEM_WIDTH,
            height: FAKE_ITEM_HEIGHT,
            transform: [...FAKE_TRANSFORM],
            fontName: 'f1',
            hasEOL: false,
          },
        ],
      }),
    cleanup: vi.fn(),
  };
}

function makeFakePdf() {
  return {
    numPages: 1,
    getPage: () => Promise.resolve(makeFakePageHandle()),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PdfPage — onTextGeometry wiring', () => {
  beforeEach(() => {
    // jsdom ResizeObserver stub
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(..._args: unknown[]) {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // jsdom has no canvas 2D context — stub it so the render path proceeds to
    // getTextContent() (without this, getContext('2d') returns null and render
    // short-circuits before the text layer code runs).
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      // Minimal CanvasRenderingContext2D stub for pdf.js renderTask
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      transform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      canvas: document.createElement('canvas'),
    }) as never;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('fires onTextGeometry with correct PageTextGeometry when active', async () => {
    const onTextGeometry = vi.fn<(geometry: PageTextGeometry) => void>();
    const fakePdf = makeFakePdf();

    render(
      <PdfPage
        pdf={fakePdf as never}
        pageNumber={1}
        displayWidth={400}
        active={true}
        onTextGeometry={onTextGeometry}
      />,
    );

    await waitFor(() => {
      expect(onTextGeometry).toHaveBeenCalledOnce();
    });

    const geometry = onTextGeometry.mock.calls[0]![0];

    // pageNumber is threaded through correctly
    expect(geometry.pageNumber).toBe(1);

    // Exactly one item (no TextMarkedContent in the fake)
    expect(geometry.items).toHaveLength(1);

    const item = geometry.items[0]!;
    expect(item.index).toBe(0);
    expect(item.str).toBe(FAKE_ITEM_STR);

    // Hand-computed box:
    //   x = transform[4] / viewport.width = 100/400 = 0.25
    //   topPdf = viewport.height - (transform[5] + height) = 600 - (200+10) = 390
    //   y = topPdf / viewport.height = 390/600 = 0.65
    //   width = itemWidth / viewport.width = 50/400 = 0.125
    //   height = itemHeight / viewport.height = 10/600
    const expectedX = FAKE_TRANSFORM[4] / FAKE_VP_WIDTH;
    const topPdf = FAKE_VP_HEIGHT - (FAKE_TRANSFORM[5] + FAKE_ITEM_HEIGHT);
    const expectedY = topPdf / FAKE_VP_HEIGHT;
    const expectedW = FAKE_ITEM_WIDTH / FAKE_VP_WIDTH;
    const expectedH = FAKE_ITEM_HEIGHT / FAKE_VP_HEIGHT;

    expect(item.box.x).toBeCloseTo(expectedX, 10);
    expect(item.box.y).toBeCloseTo(expectedY, 10);
    expect(item.box.width).toBeCloseTo(expectedW, 10);
    expect(item.box.height).toBeCloseTo(expectedH, 10);
  });

  it('does not call onTextGeometry when active=false', async () => {
    const onTextGeometry = vi.fn<(geometry: PageTextGeometry) => void>();
    const fakePdf = makeFakePdf();

    render(
      <PdfPage
        pdf={fakePdf as never}
        pageNumber={1}
        displayWidth={400}
        active={false}
        onTextGeometry={onTextGeometry}
      />,
    );

    // Wait for any async effects to settle
    await new Promise((r) => setTimeout(r, 100));
    expect(onTextGeometry).not.toHaveBeenCalled();
  });

  it('renders without error when onTextGeometry is not provided', async () => {
    const fakePdf = makeFakePdf();

    // Should not throw
    expect(() => {
      render(
        <PdfPage
          pdf={fakePdf as never}
          pageNumber={1}
          displayWidth={400}
          active={true}
        />,
      );
    }).not.toThrow();

    // Give effects time to run
    await new Promise((r) => setTimeout(r, 100));
  });
});
