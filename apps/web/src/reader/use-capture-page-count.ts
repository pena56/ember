/**
 * use-capture-page-count.ts — persist a document's total page count once the PDF is loaded.
 *
 * Fire-exactly-once per docId mount: when the reader is ready and numPages is known, call
 * store.setDocumentPageCount (09a) fire-and-forget. Idempotent at the store layer, so a re-open
 * writes nothing. All errors swallowed (invariant #1: a store failure never breaks reading).
 */
import { useEffect, useRef } from 'react';

import { useWebStore } from '../store/store-context.js';

export interface UseCapturePageCountArgs {
  docId: string;
  /** True once the PDF is loaded (status === 'ready'). */
  ready: boolean;
  /** Total pages from pdfjs; 0 until ready. */
  numPages: number;
}

export function useCapturePageCount({ docId, ready, numPages }: UseCapturePageCountArgs): void {
  const store = useWebStore();
  const storeRef = useRef(store);
  const capturedForDocRef = useRef<string | null>(null);

  useEffect(() => { storeRef.current = store; }, [store]);

  useEffect(() => {
    if (!ready || numPages <= 0) return;
    if (capturedForDocRef.current === docId) return; // already captured this mount
    capturedForDocRef.current = docId;

    void storeRef.current.setDocumentPageCount(docId, numPages).catch((err: unknown) => {
      console.warn('[useCapturePageCount] setDocumentPageCount error (swallowed):', err);
    });

    return () => { capturedForDocRef.current = null; }; // re-arm for the next docId
  }, [docId, ready, numPages]);
}
