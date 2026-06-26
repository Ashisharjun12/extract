import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

/** Count pages inside a PDF file (single upload may contain many pages). */
export async function countPdfPages(filePath: string): Promise<number> {
  const bytes = await fs.promises.readFile(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Extract selected pages (1-indexed) into a new temp PDF file.
 * Returns path to the slice — caller must unlink when done.
 */
export async function extractPdfPages(sourcePath: string, pageIndices: number[]): Promise<string> {
  const uniqueSorted = [...new Set(pageIndices)]
    .filter((p) => Number.isInteger(p) && p >= 1)
    .sort((a, b) => a - b);

  if (uniqueSorted.length === 0) {
    throw new Error('extractPdfPages: no valid page indices');
  }

  const bytes = await fs.promises.readFile(sourcePath);
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const dst = await PDFDocument.create();

  for (const pageNum of uniqueSorted) {
    const idx = pageNum - 1;
    if (idx >= total) continue;
    const [copied] = await dst.copyPages(src, [idx]);
    dst.addPage(copied);
  }

  if (dst.getPageCount() === 0) {
    throw new Error('extractPdfPages: no pages copied — indices out of range');
  }

  const outBytes = await dst.save();
  const outPath = path.join(os.tmpdir(), `ws-slice-${Date.now()}-${Math.floor(Math.random() * 10000)}.pdf`);
  await fs.promises.writeFile(outPath, outBytes);
  return outPath;
}
