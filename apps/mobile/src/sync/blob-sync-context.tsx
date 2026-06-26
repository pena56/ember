/**
 * blob-sync-context.tsx — context that carries the retryDeferred callback from
 * the single scheduler mount in _layout.tsx down to the library screen.
 *
 * Design choice: the spec allows either lifting useBlobSync to a context or
 * calling it in the screen. We use a thin context so the scheduler mounts
 * exactly once (in AnonymousAuthGate) and the library screen reads the callback
 * without mounting a second scheduler.
 *
 * Usage:
 *   // In AnonymousAuthGate (_layout.tsx):
 *   const { retryDeferred } = useBlobSync({ fileCap });
 *   <BlobSyncProvider retryDeferred={retryDeferred}>...</BlobSyncProvider>
 *
 *   // In LibraryScreen:
 *   const { retryDeferred } = useBlobSyncContext();
 */

import React, { createContext, useContext } from 'react';

interface BlobSyncContextValue {
  retryDeferred: () => Promise<void>;
}

const BlobSyncContext = createContext<BlobSyncContextValue>({
  retryDeferred: async () => {},
});

export function BlobSyncProvider({
  retryDeferred,
  children,
}: {
  retryDeferred: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <BlobSyncContext.Provider value={{ retryDeferred }}>
      {children}
    </BlobSyncContext.Provider>
  );
}

export function useBlobSyncContext(): BlobSyncContextValue {
  return useContext(BlobSyncContext);
}
