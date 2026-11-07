import { describe, expect, it } from 'vitest';
import { isPdfHeader, sha256Hex } from './pdfFiles';

describe('PDF file helpers', () => {
  it('accepts a PDF header and rejects unrelated or incomplete files', () => {
    expect(isPdfHeader(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(isPdfHeader(new TextEncoder().encode('<html'))).toBe(false);
    expect(isPdfHeader(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
  });

  it('returns a lowercase SHA-256 digest', async () => {
    expect(await sha256Hex(new TextEncoder().encode('test')))
      .toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });
});
