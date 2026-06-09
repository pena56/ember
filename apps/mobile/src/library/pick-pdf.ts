// pick-pdf.ts — thin wrapper over expo-document-picker + expo-file-system.
// The ONLY file importing expo-document-picker, and (besides ExpoFileSystemBlobStore)
// the only file importing expo-file-system.

import { getDocumentAsync } from 'expo-document-picker';
import { cacheDirectory, copyAsync, deleteAsync, readAsStringAsync } from 'expo-file-system/legacy';

import { base64ToBytes } from '../store/base64.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PickedPdf {
  bytes: Uint8Array;
  name: string;
  mimeType: string | undefined;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Open the native document picker filtered to PDFs (multiple allowed).
 *
 * Reading the pick is the tricky part on Android / Expo Go. The new
 * expo-file-system `File.bytes()` can't read a SAF `content://` URI ("Missing READ
 * permission"), and `copyToCacheDirectory` drops the file in `cache/DocumentPicker/`,
 * which sits OUTSIDE the per-experience scope the FileSystem APIs may read
 * ("isn't readable"). So: take the raw `content://` URI (copyToCacheDirectory:false)
 * and use legacy `copyAsync` — which reads SAF content via ContentResolver — to copy
 * it into the SCOPED `cacheDirectory`, then read THAT as base64 and decode to bytes.
 * The temp copy is deleted afterwards. Returns an empty array if the user cancels.
 *
 * Not headless-testable (native module) — exercised by the device-verify screen.
 */
export async function pickPdf(): Promise<PickedPdf[]> {
  const result = await getDocumentAsync({
    type: 'application/pdf',
    multiple: true,
    copyToCacheDirectory: false,
  });

  if (result.canceled || !result.assets) {
    return [];
  }

  const scopedCache = cacheDirectory;
  if (scopedCache === null) {
    throw new Error('No cache directory available to stage the picked file.');
  }

  const picked: PickedPdf[] = [];

  for (const asset of result.assets) {
    // Stage the SAF content URI into the scoped (readable) cache, then read it.
    const dest = `${scopedCache}ember-pick-${Date.now().toString()}-${picked.length.toString()}.pdf`;
    await copyAsync({ from: asset.uri, to: dest });
    try {
      const base64 = await readAsStringAsync(dest, { encoding: 'base64' });
      picked.push({
        bytes: base64ToBytes(base64),
        name: asset.name,
        mimeType: asset.mimeType,
      });
    } finally {
      await deleteAsync(dest, { idempotent: true });
    }
  }

  return picked;
}
