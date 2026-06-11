/**
 * App.tsx — top-level view switch between Library and Reader.
 *
 * Navigation is state-based (openDocId). No react-router dep.
 * A tabbed Today/Library/Stats shell is a later infra unit; a single state
 * switch suffices for unit 05a.
 */

import { useEffect, useState } from 'react';

import { Toaster } from '@/components/ui/sonner.js';

import { LibraryPage } from './library/library-page.js';
import { ReaderPage } from './reader/reader-page.js';
import { useWebStore } from './store/store-context.js';

// ── Connected reader wrapper ──────────────────────────────────────────────────
// Looks up the document title before mounting the reader so the toolbar has
// the correct title immediately (avoids a layout shift).

function ConnectedReader({
  docId,
  onClose,
}: {
  docId: string;
  onClose: () => void;
}) {
  // Use the store to look up the title (best-effort; falls back to id)
  const store = useWebStore();
  const [title, setTitle] = useState<string>('');

  // Resolve the title for this docId (best-effort; toolbar falls back to id).
  useEffect(() => {
    let cancelled = false;
    void store.listDocuments().then((docs) => {
      if (cancelled) return;
      const doc = docs.find((d) => d.id === docId);
      if (doc) setTitle(doc.title);
    });
    return () => { cancelled = true; };
  }, [store, docId]);

  // key={docId} forces a fresh mount per document so reader state (incl. the
  // resume-once guard) never carries across a doc switch.
  return <ReaderPage key={docId} docId={docId} title={title || docId} onClose={onClose} />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  if (openDocId !== null) {
    return (
      <ConnectedReader
        docId={openDocId}
        onClose={() => { setOpenDocId(null); }}
      />
    );
  }

  return (
    <>
      <LibraryPage onOpen={setOpenDocId} />
      <Toaster />
    </>
  );
}
