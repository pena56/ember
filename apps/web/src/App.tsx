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
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner.js';

import { AppShell } from './app-shell.js';
import { consumePendingAuthToast } from './auth/claim-reload.js';
import { useAnonymousAuth } from './auth/use-anonymous-auth.js';
import { LibraryPage } from './library/library-page.js';
import { useNotificationSync } from './notify/use-notification-sync.js';
import { ReaderPage } from './reader/reader-page.js';
import { SettingsPage } from './settings/settings-page.js';
import { StatsPage } from './stats/stats-page.js';
import { useWebStore } from './store/store-context.js';
import { useBlobSync } from './sync/use-blob-sync.js';
import { useReconciler } from './sync/use-reconciler.js';
import { useStorageUsage } from './sync/use-storage-usage.js';
import { TodayPage } from './today/today-page.js';

// ── Library route wrapper ────────────────────────────────────────────────────

function LibraryRoute({ onRetrySync }: { onRetrySync: () => void }) {
  const navigate = useNavigate();
  return (
    <LibraryPage
      onOpen={(id) => { void navigate(`/read/${id}`); }}
      onRetrySync={onRetrySync}
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
  // Auto sign-in anonymously when online + unauthenticated. No UI — side-effect only.
  useAnonymousAuth();

  // Background sync scheduler — pushes the local outbox + folds in remote
  // changes when authed. No UI — side-effect only (Convex off the read path).
  useReconciler();

  // Background notification scheduler — registers the device + submits today's intent;
  // no UI, no local fire (delivery rides mobile). Convex off the read path.
  useNotificationSync();

  // Background blob-sync scheduler — uploads local blobs + downloads missing
  // ones. Decoupled from record-sync (separate concerns). The library page
  // reads blob-sync status records directly; retryDeferred is threaded down
  // as a prop so LibraryPage doesn't need a nested useConvexAuth.
  // Pass the server file cap so over-cap files skip the encrypt+upload entirely.
  const usage = useStorageUsage();
  const { retryDeferred } = useBlobSync(usage ? { fileCap: usage.fileCap } : undefined);

  // After a claim/sign-in reload (see claim-reload.ts), show the carried toast.
  useEffect(() => {
    const msg = consumePendingAuthToast();
    if (msg) toast.success(msg);
  }, []);

  return (
    <>
      <Routes>
        {/* Shell layout — Today + Library share the top-nav chrome */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="library" element={<LibraryRoute onRetrySync={() => { void retryDeferred(); }} />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="settings" element={<SettingsPage />} />
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
