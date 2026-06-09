import { describe, expect, it } from 'vitest';

import { computeDocumentId, makeDocument } from '../document.js';
import type { Hasher } from '../document.js';

describe('makeDocument', () => {
  it('derives title from filename by stripping extension', () => {
    const doc = makeDocument({
      id: 'abc123',
      filename: 'report.pdf',
      byteSize: 1024,
      contentType: 'application/pdf',
      importedAt: 1000,
    });
    expect(doc.title).toBe('report');
  });

  it('allows title override', () => {
    const doc = makeDocument({
      id: 'abc123',
      filename: 'report.pdf',
      byteSize: 1024,
      contentType: 'application/pdf',
      importedAt: 1000,
      title: 'My Custom Title',
    });
    expect(doc.title).toBe('My Custom Title');
  });

  it('handles filename with no extension', () => {
    const doc = makeDocument({
      id: 'abc123',
      filename: 'readme',
      byteSize: 512,
      contentType: 'text/plain',
      importedAt: 2000,
    });
    expect(doc.title).toBe('readme');
  });

  it('handles filename with multiple dots (strips only the last extension)', () => {
    const doc = makeDocument({
      id: 'abc123',
      filename: 'my.report.v2.pdf',
      byteSize: 2048,
      contentType: 'application/pdf',
      importedAt: 3000,
    });
    expect(doc.title).toBe('my.report.v2');
  });

  it('maps all fields correctly', () => {
    const doc = makeDocument({
      id: 'sha256hex',
      filename: 'book.pdf',
      byteSize: 4096,
      contentType: 'application/pdf',
      importedAt: 999,
      title: 'A Book',
    });
    expect(doc).toEqual({
      id: 'sha256hex',
      title: 'A Book',
      filename: 'book.pdf',
      byteSize: 4096,
      contentType: 'application/pdf',
      importedAt: 999,
    });
  });
});

describe('computeDocumentId', () => {
  it('delegates to the hasher and returns its result', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fakeHasher: Hasher = {
      sha256Hex: async () => 'deadbeef',
    };
    const id = await computeDocumentId(bytes, fakeHasher);
    expect(id).toBe('deadbeef');
  });

  it('passes bytes through to the hasher unchanged', async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    let capturedBytes: Uint8Array | undefined;
    const fakeHasher: Hasher = {
      sha256Hex: async (b) => {
        capturedBytes = b;
        return 'cafebabe';
      },
    };
    await computeDocumentId(bytes, fakeHasher);
    expect(capturedBytes).toBe(bytes);
  });
});
