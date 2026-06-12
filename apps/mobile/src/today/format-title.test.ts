import { describe, expect, it } from 'vitest';

import { formatBookTitle } from './format-title.js';

describe('formatBookTitle', () => {
  it('strips the OceanofPDF download prefix, underscores, and tidies the separator', () => {
    expect(formatBookTitle('_OceanofPDF.com_The_Forgotten_Trinity_-_James_R_White')).toBe(
      'The Forgotten Trinity — James R White',
    );
  });

  it('strips a www. variant of the site prefix', () => {
    expect(formatBookTitle('www.OceanofPDF.com_A_Book')).toBe('A Book');
  });

  it('drops a trailing .pdf extension', () => {
    expect(formatBookTitle('Already Clean.pdf')).toBe('Already Clean');
  });

  it('leaves an already-clean title unchanged', () => {
    expect(formatBookTitle('Pride and Prejudice')).toBe('Pride and Prejudice');
  });

  it('preserves intra-word hyphens (only space-padded separators become em dashes)', () => {
    expect(formatBookTitle('Spider-Man')).toBe('Spider-Man');
  });

  it('collapses repeated whitespace', () => {
    expect(formatBookTitle('Too    many   spaces')).toBe('Too many spaces');
  });

  it('falls back to the trimmed original when cleanup empties the string', () => {
    expect(formatBookTitle('  Untitled  ')).toBe('Untitled');
  });
});
