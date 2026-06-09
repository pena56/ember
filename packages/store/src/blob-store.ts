// BlobStore contract — content-addressed by document id (sha256 hex).
// Bindings: OPFS (04b), expo-file-system documentDirectory (04c).

/**
 * Content-addressed byte store.
 *
 * @remarks
 * - `put` is an **upsert**: overwrites if an entry with the same id already exists.
 * - Implementations MUST copy bytes on `put` and `get` so callers cannot mutate stored
 *   state by reference (value-isolation parallel to Repository).
 * - `close()` is idempotent: calling it multiple times MUST NOT throw.
 */
export interface BlobStore {
  put(id: string, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | undefined>;
  has(id: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  close(): Promise<void>;
}
