/**
 * pdf.ts — thin pdf.js loader + worker wiring (Vite ESM, pdfjs-dist 6).
 *
 * Keep this module side-effect-light so vi.mock('../reader/pdf.js') works in tests.
 * The worker is configured once on module evaluation; subsequent calls to getDocument
 * reuse the running worker. Callers own .cleanup() on the returned proxy.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Wire the worker for Vite. The ?url suffix tells Vite to resolve this as an
// asset URL (a string), not to bundle/execute it. TS sees it via the `*?url`
// module declaration in vite-env.d.ts.
GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Load a PDF document from raw bytes.
 * Returns a PDFDocumentProxy. Caller is responsible for calling .cleanup() on
 * unmount to free the document resources.
 */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const task = getDocument({ data: bytes });
  return task.promise;
}
