/**
 * convex-blob-transport.ts — BlobTransport backed by the Convex client.
 *
 * Wraps the four 13a file functions (generateUploadUrl, saveBlob, getDownloadUrl,
 * deleteBlob) into the BlobTransport port that the blob-sync engine requires.
 *
 * Invariant: storageId + upload/download URLs NEVER leave this binding.
 * Core only ever sees contentId ⇄ bytes.
 *
 * Auth token is auto-attached by the ConvexAuthProvider.
 */

import type { ConvexReactClient } from 'convex/react';

import { api } from '@ember/convex/_generated/api';
import type { BlobTransport, SaveBlobResult } from '@ember/core';

export function createConvexBlobTransport(client: ConvexReactClient): BlobTransport {
  return {
    async upload(ciphertext: Uint8Array): Promise<{ storageId: string }> {
      // 1. Get a short-lived upload URL from Convex storage
      const url = await client.mutation(api.files.generateUploadUrl);

      // 2. POST the ciphertext directly to the Convex storage URL
      const response = await fetch(url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: ciphertext as unknown as BodyInit,
      });

      // 3. Parse storageId from the response — stays inside the binding
      const { storageId } = (await response.json()) as { storageId: string };
      return { storageId };
    },

    saveBlob(contentId: string, storageId: string): Promise<SaveBlobResult> {
      // Pass the SaveBlobResult union straight through — never throws on a limit.
      // storageId is typed as Id<"_storage"> server-side; the runtime value IS a
      // valid storage Id string — cast is safe (Convex Id<T> is a branded string).
      // The dataModel/Id type isn't an exported subpath of @ember/convex (only
      // _generated/api is), so cast through any rather than cross the package boundary.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return client.mutation(api.files.saveBlob, { contentId, storageId } as any) as Promise<SaveBlobResult>;
    },

    async download(contentId: string): Promise<Uint8Array | null> {
      // 1. Get the download URL (null → blob not on server yet)
      const url = await client.query(api.files.getDownloadUrl, { contentId });
      if (url === null || url === undefined) return null;

      // 2. Fetch the ciphertext — URL stays inside the binding
      const response = await fetch(url as string);
      return new Uint8Array(await response.arrayBuffer());
    },

    async deleteBlob(contentId: string): Promise<void> {
      await client.mutation(api.files.deleteBlob, { contentId });
    },
  };
}
