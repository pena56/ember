/**
 * capture-geometry.mjs — one-time golden generator for the 05c-2 parity fixture.
 *
 * Loads test-fixtures/sample.pdf via real pdf.js (legacy Node build), extracts
 * page 1's TextContent at scale=1, and writes two committed golden files:
 *
 *   test-fixtures/raw-textcontent.json  — verbatim getTextContent() output
 *   test-fixtures/expected-geometry.json — extractPageGeometry() result
 *
 * These are NOT regenerated at build/CI time. Run manually to refresh:
 *   node scripts/capture-geometry.mjs
 *
 * NOTE — tautology guard: because this script produces expected-geometry.json
 * using the same normalizer logic the test re-runs, the golden snapshot only
 * catches *regressions*. Correctness of the golden itself is pinned by the
 * INDEPENDENT hand-computed spot-checks in page-geometry.test.ts plus 05c-1's
 * hand-verified core math. Read both before trusting a regenerated golden.
 *
 * AUTO-GENERATED header on outputs: do not edit raw-textcontent.json or
 * expected-geometry.json by hand — regenerate with this script.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Load pdf.js legacy build (runs in Node; no canvas needed for text extraction) ──

const pdfJsPath = resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
// On Windows, Node ESM requires file:// URLs for absolute paths in dynamic imports.
const pdfJsUrl = new URL(`file:///${pdfJsPath.replace(/\\/g, '/')}`).href;
const { getDocument, GlobalWorkerOptions } = await import(pdfJsUrl);

// Point to the legacy worker file. Text extraction does not run canvas render code,
// but pdf.js requires a valid workerSrc even when using the fake worker fallback.
const workerPath = resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
GlobalWorkerOptions.workerSrc = new URL(`file:///${workerPath.replace(/\\/g, '/')}`).href;

// ── Inline normalizer (mirrors @ember/core normalizePageText exactly) ──────────
// We inline rather than import the TypeScript source because Node can't resolve
// the @ember/core workspace package (its exports point to .ts, not compiled .js).
// The inlined logic is byte-for-byte identical to packages/core/src/text-geometry.ts.
// If that file changes, update this section too.

function isTextItem(it) {
  return 'transform' in it;
}

function toRawTextItems(items) {
  return items.filter(isTextItem).map((it) => ({
    str: it.str,
    width: it.width,
    height: it.height,
    transform: it.transform,
  }));
}

function normalizePageText(pageNumber, viewport, rawItems) {
  const safeW = viewport.width === 0;
  const safeH = viewport.height === 0;

  const items = rawItems.map((raw, index) => {
    const left = raw.transform[4];
    const baseline = raw.transform[5];
    const w = raw.width;
    const h = raw.height;
    const topPdf = viewport.height - (baseline + h);

    const box = {
      x: safeW ? 0 : left / viewport.width,
      y: safeH ? 0 : topPdf / viewport.height,
      width: safeW ? 0 : w / viewport.width,
      height: safeH ? 0 : h / viewport.height,
    };

    return { index, str: raw.str, box };
  });

  return { pageNumber, items };
}

function extractPageGeometry(pageNumber, viewport, textContent) {
  return normalizePageText(pageNumber, viewport, toRawTextItems(textContent.items));
}

// ── Run extraction ─────────────────────────────────────────────────────────────

const samplePdfPath = resolve(root, 'test-fixtures/sample.pdf');
const outDir = resolve(root, 'test-fixtures');
mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(readFileSync(samplePdfPath));

const loadingTask = getDocument({ data, useWorkerFetch: false, isEvalSupported: false });
const pdfDoc = await loadingTask.promise;

const page = await pdfDoc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();

console.log(`[capture-geometry] page 1: ${vp.width.toFixed(1)}×${vp.height.toFixed(1)} pts`);
console.log(`[capture-geometry] items total (incl. TextMarkedContent): ${tc.items.length}`);

const textItems = tc.items.filter(isTextItem);
console.log(`[capture-geometry] TextItem count (after filter): ${textItems.length}`);

if (textItems.length < 2) {
  console.error('[capture-geometry] ERROR: fewer than 2 TextItems extracted — check sample.pdf');
  process.exit(1);
}

// raw-textcontent.json: verbatim getTextContent() output (keeps any TextMarkedContent markers)
const rawPayload = {
  pageNumber: 1,
  viewport: { width: vp.width, height: vp.height },
  items: tc.items,
};

// expected-geometry.json: extractPageGeometry() output (TextMarkedContent filtered)
const geometry = extractPageGeometry(1, { width: vp.width, height: vp.height }, tc);

const rawPath = resolve(outDir, 'raw-textcontent.json');
const expectedPath = resolve(outDir, 'expected-geometry.json');

writeFileSync(rawPath, JSON.stringify(rawPayload, null, 2), 'utf8');
writeFileSync(expectedPath, JSON.stringify(geometry, null, 2), 'utf8');

console.log(`[capture-geometry] written ${rawPath}`);
console.log(`[capture-geometry] written ${expectedPath}`);
console.log(`[capture-geometry] geometry items: ${geometry.items.length}`);
geometry.items.forEach((it) => {
  console.log(`  [${it.index}] str="${it.str}" y=${it.box.y.toFixed(4)} (${it.box.y < 0.5 ? 'near TOP' : 'near BOTTOM'})`);
});
