import type { BlobStore } from '@ember/store';

/**
 * OPFS-backed content-addressed blob store.
 *
 * All blobs live under a `blobs/` subdirectory of the OPFS root. The directory
 * handle is obtained lazily and cached for the lifetime of this instance.
 *
 * Value isolation is inherent: OPFS copies bytes through the file system on
 * every `put` and `get`, so callers cannot mutate stored state by reference.
 *
 * NOTE: Not unit-testable under jsdom (no OPFS). Browser-verified by the
 * manual verify step in the spec.
 */
export class OpfsBlobStore implements BlobStore {
  private readonly dirPromise: Promise<FileSystemDirectoryHandle>;

  constructor() {
    this.dirPromise = navigator.storage.getDirectory().then((root) =>
      root.getDirectoryHandle('blobs', { create: true }),
    );
  }

  private async dir(): Promise<FileSystemDirectoryHandle> {
    return this.dirPromise;
  }

  async put(id: string, bytes: Uint8Array): Promise<void> {
    const dir = await this.dir();
    const fh = await dir.getFileHandle(id, { create: true });
    const writable = await fh.createWritable();
    // Cast to ArrayBuffer-backed Uint8Array as required by the FileSystem API typings.
    await writable.write(bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
  }

  async get(id: string): Promise<Uint8Array | undefined> {
    const dir = await this.dir();
    try {
      const fh = await dir.getFileHandle(id);
      const file = await fh.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return undefined;
      }
      throw err;
    }
  }

  async has(id: string): Promise<boolean> {
    const dir = await this.dir();
    try {
      await dir.getFileHandle(id);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    const dir = await this.dir();
    try {
      await dir.removeEntry(id);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return;
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    // No-op: OPFS has no connection lifecycle to manage.
  }
}
