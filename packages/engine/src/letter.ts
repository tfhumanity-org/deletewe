/**
 * A minimal PDF writer for opt-out letters and reports.
 *
 * Hand-rolled rather than pulling a PDF library into the package that handles
 * member PII: the output is a single-content-stream document with one standard
 * font, which is all a letter needs, and it keeps the dependency surface of
 * the PII path at zero.
 */

export interface LetterInput {
  readonly recipient: string;
  readonly addressLines: readonly string[];
  readonly body: string;
  readonly date: string;
  readonly title?: string;
}

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const FONT_SIZE = 11;
const LEADING = 15;
const CHARS_PER_LINE = 88;

/** Escapes the three characters that are special inside a PDF string literal. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Latin-1 is what the standard PDF fonts encode; anything else is dropped. */
function toLatin1(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.normalize('NFKD').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '');
}

export function wrapText(text: string, width = CHARS_PER_LINE): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim().length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line.length === 0) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line.length > 0) out.push(line);
  }
  return out;
}

export function renderLetterPdf(input: LetterInput): Uint8Array {
  const lines: string[] = [];
  if (input.title) lines.push(input.title, '');
  lines.push(input.date, '');
  lines.push(input.recipient, ...input.addressLines, '');
  lines.push(...wrapText(input.body));
  return renderPdf(lines);
}

/** Lays out plain text lines across as many pages as needed. */
export function renderPdf(allLines: readonly string[]): Uint8Array {
  const linesPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LEADING);
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(1, allLines.length); i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage).map((l) => toLatin1(l)));
  }

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  // 1 = catalog, 2 = pages, 3 = font, then (content, page) pairs.
  const firstContentObject = 4;
  for (let i = 0; i < pages.length; i++) pageObjectNumbers.push(firstContentObject + i * 2 + 1);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  pages.forEach((pageLines, index) => {
    const contentNumber = firstContentObject + index * 2;
    const pageNumber = contentNumber + 1;
    const body = [
      'BT',
      `/F1 ${FONT_SIZE} Tf`,
      `${LEADING} TL`,
      `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`,
      ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      'ET',
    ].join('\n');
    objects[contentNumber] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    const object = objects[n];
    if (object === undefined) continue;
    offsets[n] = pdf.length;
    pdf += `${n} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  const count = objects.length;
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) {
    pdf += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
