/**
 * app/reader/[id].tsx — expo-router dynamic route for the PDF reader.
 *
 * Reads `id` and optional `title` from useLocalSearchParams and renders
 * ReaderScreen. Back button calls router.back() to return to the Library
 * with the list intact (expo-router stack navigation).
 *
 * headerShown: false is set globally in _layout.tsx so no per-screen override
 * is needed.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';

import { ReaderScreen } from '../../src/reader/reader-screen.js';

export default function ReaderRoute() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();

  return (
    <ReaderScreen
      docId={id}
      title={title ?? 'Document'}
      onBack={() => { router.back(); }}
    />
  );
}
