/**
 * App.tsx — route tree (no Router here — see main.tsx / MemoryRouter in tests).
 *
 * Shell layout route:
 *   /           → redirect to /today
 *   /today      → TodayPage
 *   /library    → LibraryPage
 *
 * Outside the shell:
 *   /read/:docId → ReaderRoute (full-screen)
 *   *            → redirect to /today
 */

import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';

import { Toaster } from '@/components/ui/sonner.js';

import { AppShell } from './app-shell.js';
import { LibraryPage } from './library/library-page.js';
import { ReaderPage } from './reader/reader-page.js';
import { StatsPage } from './stats/stats-page.js';
import { useWebStore } from './store/store-context.js';
import { TodayPage } from './today/today-page.js';

// ── Library route wrapper ────────────────────────────────────────────────────

function LibraryRoute() {
  const navigate = useNavigate();
  return (
    <LibraryPage
      onOpen={(id) => { void navigate(`/read/${id}`); }}
    />
  );
}

// ── Reader route wrapper ──────────────────────────────────────────────────────

function ReaderRoute() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const store = useWebStore();
  const [title, setTitle] = useState<string>('');

  // Resolve the title for this docId (best-effort; toolbar falls back to id).
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    void store.listDocuments().then((docs) => {
      if (cancelled) return;
      const doc = docs.find((d) => d.id === docId);
      if (doc) setTitle(doc.title);
    });
    return () => { cancelled = true; };
  }, [store, docId]);

  if (!docId) {
    return <Navigate to="/library" replace />;
  }

  // key={docId} forces a fresh mount per document so reader state (incl. the
  // resume-once guard) never carries across a doc switch.
  return (
    <ReaderPage
      key={docId}
      docId={docId}
      title={title || docId}
      onClose={() => { void navigate(-1); }}
    />
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <Routes>
        {/* Shell layout — Today + Library share the top-nav chrome */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="library" element={<LibraryRoute />} />
          <Route path="stats" element={<StatsPage />} />
        </Route>

        {/* Full-screen reader — outside the shell */}
        <Route path="read/:docId" element={<ReaderRoute />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>

      <Toaster />
    </>
  );
}
