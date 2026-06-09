// expo-file-system-blob-store.ts — ExpoFileSystemBlobStore implements BlobStore.
// The ONLY file (besides pick-pdf.ts) in this project that imports expo-file-system.
//
// Content-addressed by document id under a `blobs/` sub-directory of the app's
// document directory (safe from OS eviction, unlike cache directory).
//
// Value isolation is inherent: bytes round-trip through disk — write copies in,
// read returns a fresh Uint8Array from the native layer. Callers cannot mutate
// stored state by reference.
//
// Not headless-testable (native module) — exercised by the device-verify screen.

import { Directory, File, Paths } from 'expo-file-system';

import type { BlobStore } from '@ember/store';

export class ExpoFileSystemBlobStore implements BlobStore {
  /** Lazily initialised blobs/ directory handle. */
  private dir: Directory | null = null;

  private getDir(): Directory {
    if (!this.dir) {
      const d = new Directory(Paths.document, 'blobs');
      if (!d.exists) {
        d.create({ intermediates: true });
      }
      this.dir = d;
    }
    return this.dir;
  }

  async put(id: string, bytes: Uint8Array): Promise<void> {
    const file = new File(this.getDir(), id);
    file.write(bytes);
  }

  async get(id: string): Promise<Uint8Array | undefined> {
    const file = new File(this.getDir(), id);
    if (!file.exists) return undefined;
    return file.bytes();
  }

  async has(id: string): Promise<boolean> {
    const file = new File(this.getDir(), id);
    return file.exists;
  }

  async delete(id: string): Promise<void> {
    const file = new File(this.getDir(), id);
    if (file.exists) {
      file.delete();
    }
  }

  /** No-op — no open handle to close. Idempotent. */
  async close(): Promise<void> {
    // no-op
  }
}
