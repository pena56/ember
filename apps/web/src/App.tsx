import { Toaster } from '@/components/ui/sonner.js';

import { LibraryPage } from './library/library-page.js';

export default function App() {
  return (
    <>
      <LibraryPage />
      <Toaster />
    </>
  );
}
