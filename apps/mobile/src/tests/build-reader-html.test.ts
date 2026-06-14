/**
 * build-reader-html.test.ts — assert that the generated HTML string contains the
 * selection bridge, paint layer, and highlight palette (10d additions).
 *
 * We test on substrings only (same strategy as any HTML-template snapshot).
 * Also asserts HIGHLIGHT_HEX values equal the tokens' --color-highlight-*.
 */

import { describe, expect, it } from 'vitest';

import { buildReaderHtml } from '../reader/build-reader-html.js';

// ── Tokens parity constants (must match packages/tokens/src/theme.uniwind.css) ──
// If these ever drift, the test tells you before device testing does.
const TOKEN_HIGHLIGHT_HEX = {
  yellow: '#f4d06f',
  green:  '#9fc08a',
  blue:   '#93b7d4',
  pink:   '#e3a7be',
} as const;

// ── Fixture ───────────────────────────────────────────────────────────────────

// Minimal stub srcs — we only care about the surrounding scaffold, not pdf.js content.
const HTML = buildReaderHtml('/* pdf-js-stub */', '/* worker-stub */');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildReaderHtml — 10d additions', () => {
  // ── Highlight palette ──────────────────────────────────────────────────────

  it('includes HIGHLIGHT_HEX yellow token value', () => {
    expect(HTML).toContain(TOKEN_HIGHLIGHT_HEX.yellow);
  });

  it('includes HIGHLIGHT_HEX green token value', () => {
    expect(HTML).toContain(TOKEN_HIGHLIGHT_HEX.green);
  });

  it('includes HIGHLIGHT_HEX blue token value', () => {
    expect(HTML).toContain(TOKEN_HIGHLIGHT_HEX.blue);
  });

  it('includes HIGHLIGHT_HEX pink token value', () => {
    expect(HTML).toContain(TOKEN_HIGHLIGHT_HEX.pink);
  });

  it('contains a parity comment referencing the tokens file', () => {
    // Must have a parity comment (same convention as READER_PALETTE)
    expect(HTML).toContain('must match');
  });

  // ── Selection bridge ───────────────────────────────────────────────────────

  it('contains the selectionchange event listener', () => {
    expect(HTML).toContain('selectionchange');
  });

  it('posts a selection message with type:"selection"', () => {
    expect(HTML).toContain("type: 'selection'");
  });

  it('posts a selectionCleared message', () => {
    expect(HTML).toContain("type: 'selectionCleared'");
  });

  it('reads startChar and endChar from the TreeWalker sum', () => {
    expect(HTML).toContain('startChar');
    expect(HTML).toContain('endChar');
  });

  it('reads getBoundingClientRect for the selection rect', () => {
    expect(HTML).toContain('getBoundingClientRect');
  });

  // ── Paint layer ────────────────────────────────────────────────────────────

  it('handles setAnnotations message', () => {
    expect(HTML).toContain("case 'setAnnotations'");
  });

  it('handles clearSelection message', () => {
    expect(HTML).toContain("case 'clearSelection'");
  });

  it('contains the paintAnnotations function', () => {
    expect(HTML).toContain('paintAnnotations');
  });

  it('contains the ember-hl class for highlight overlay divs', () => {
    expect(HTML).toContain('ember-hl');
  });

  it('calls paintAnnotations at the end of renderPage', () => {
    // The paint call must appear after renderPage renders content
    const paintIdx = HTML.indexOf('paintAnnotations(pageNum');
    const renderPageIdx = HTML.indexOf('async function renderPage(');
    expect(paintIdx).toBeGreaterThan(renderPageIdx);
  });
});
