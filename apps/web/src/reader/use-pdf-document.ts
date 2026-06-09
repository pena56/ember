/**
 * use-pdf-document.ts — load lifecycle hook for a PDF document.
 *
 * Given a docId, retrieves bytes from the store, loads via pdf.js, and
 * manages the proxy lifecycle (cleanup on unmount / id change).
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';

import { useWebStore } from '../store/store-context.js';

import { loadPdf } from './pdf.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PdfDocumentStatus = 'loading' | 'ready' | 'error' | 'missing';

export interface PdfDocumentState {
  status: PdfDocumentStatus;
  pdf?: PDFDocumentProxy;
  numPages: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePdfDocument(docId: string): PdfDocumentState {
  const store = useWebStore();
  const [state, setState] = useState<PdfDocumentState>({
    status: 'loading',
    numPages: 0,
  });

  useEffect(() => {
    let cancelled = false;
    let proxy: PDFDocumentProxy | undefined;

    async function load() {
      setState({ status: 'loading', numPages: 0 });

      try {
        const bytes = await store.getPdfBytes(docId);

        if (cancelled) return;

        if (bytes === undefined) {
          setState({ status: 'missing', numPages: 0 });
          return;
        }

        proxy = await loadPdf(bytes);

        if (cancelled) {
          // cleanup() releases document resources on PDFDocumentProxy
          void proxy.cleanup();
          return;
        }

        setState({ status: 'ready', pdf: proxy, numPages: proxy.numPages });
      } catch {
        if (!cancelled) {
          setState({ status: 'error', numPages: 0 });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (proxy !== undefined) {
        void proxy.cleanup();
        proxy = undefined;
      }
    };
  }, [store, docId]);

  return state;
}
