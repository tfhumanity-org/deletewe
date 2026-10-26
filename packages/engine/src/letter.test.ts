import { describe, expect, it } from 'vitest';
import { renderLetterPdf, renderPdf, wrapText } from './letter.ts';

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('one two three four five', 9)).toEqual(['one two', 'three', 'four five']);
  });

  it('preserves paragraph breaks', () => {
    expect(wrapText('a\n\nb', 20)).toEqual(['a', '', 'b']);
  });
});

describe('renderPdf', () => {
  it('produces a parseable single-page PDF', () => {
    const pdf = text(renderPdf(['Hello']));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('(Hello) Tj');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('paginates long documents', () => {
    const pdf = text(renderPdf(Array.from({ length: 200 }, (_, i) => `line ${String(i)}`)));
    expect(pdf).toContain('/Count 5');
  });

  it('escapes parentheses and backslashes so the content stream stays valid', () => {
    expect(text(renderPdf(['a (b) \\ c']))).toContain('(a \\(b\\) \\\\ c) Tj');
  });

  it('drops characters the standard font cannot encode', () => {
    expect(text(renderPdf(['ok \u{1F600} fine']))).toContain('(ok  fine) Tj');
  });
});

describe('renderLetterPdf', () => {
  it('includes the recipient, address and body', () => {
    const pdf = text(
      renderLetterPdf({
        recipient: 'Privacy Officer',
        addressLines: ['Example Broker Inc', 'PO Box 1', 'Austin TX 78701'],
        body: 'Please delete my personal information.',
        date: '2026-10-27',
      }),
    );
    expect(pdf).toContain('(Privacy Officer) Tj');
    expect(pdf).toContain('(PO Box 1) Tj');
    expect(pdf).toContain('(2026-10-27) Tj');
    expect(pdf).toContain('Please delete my personal information.');
  });
});
