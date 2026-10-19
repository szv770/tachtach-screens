// PDF -> one JPEG per page, using poppler (pdftoppm / pdfinfo). Fails closed with plain-English errors.
// Everything is execFile with an argument array (no shell), inside a private temp folder that is always removed.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, readdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { PDF_MAX_PAGES, PDF_MAX_BYTES, isPdfBuffer, parsePageCount, pdfScaleTo, pageFilename } from '../shared/pdfPages.js';

const run = promisify(execFile);
const TIMEOUT_MS = 90_000;

export class PdfError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

let toolsOk = null; // cached after the first check
/** True when pdftoppm and pdfinfo can be run on this computer. */
export async function pdfToolsAvailable() {
  if (toolsOk !== null) return toolsOk;
  try {
    await run('pdftoppm', ['-v'], { timeout: 5000 }).catch((e) => { if (e.code === 'ENOENT') throw e; });
    await run('pdfinfo', ['-v'], { timeout: 5000 }).catch((e) => { if (e.code === 'ENOENT') throw e; });
    toolsOk = true;
  } catch { toolsOk = false; }
  return toolsOk;
}
export const _resetToolsCache = () => { toolsOk = null; };

// One conversion at a time: it is heavy on a Raspberry Pi.
let chain = Promise.resolve();

/**
 * Convert an uploaded PDF. Writes <id>.jpg (page 1) and <id>-pNN.jpg into `uploadDir`.
 * Returns { id, filename, pages, width, height, mediaType: 'pdf', pageFilenames }.
 */
export function processPdf(buffer, box, uploadDir) {
  const job = chain.then(() => convert(buffer, box, uploadDir));
  chain = job.catch(() => {});
  return job;
}

async function convert(buffer, box, uploadDir) {
  if (!isPdfBuffer(buffer)) throw new PdfError('That file is not a PDF.');
  if (buffer.length > PDF_MAX_BYTES) throw new PdfError(`This PDF is too big. The limit is ${Math.round(PDF_MAX_BYTES / 1048576)} MB.`, 413);
  if (!(await pdfToolsAvailable())) {
    throw new PdfError('PDFs cannot be shown yet: the PDF tool (poppler-utils) is not installed on the screen computer. Ask whoever set it up to run "sudo apt install poppler-utils", or upload each page as a picture.', 503);
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tt-pdf-'));
  try {
    const input = path.join(dir, 'input.pdf');
    await writeFile(input, buffer, { mode: 0o600 });
    let info = '';
    try { info = (await run('pdfinfo', [input], { timeout: 30_000, maxBuffer: 1 << 20 })).stdout; }
    catch (e) {
      if (/incorrect password|encrypted/i.test(`${e.stderr || ''}${e.message}`)) throw new PdfError('This PDF is password protected. Remove the password and try again.');
      throw new PdfError('This PDF could not be read. It may be damaged.');
    }
    const pages = parsePageCount(info);
    if (!pages) throw new PdfError('This PDF has no pages that can be shown.');
    if (pages > PDF_MAX_PAGES) throw new PdfError(`This PDF has ${pages} pages. The limit is ${PDF_MAX_PAGES}. Split it into smaller PDFs.`);

    const prefix = path.join(dir, 'page');
    try {
      await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=88', '-scale-to', String(pdfScaleTo(box)), '-l', String(PDF_MAX_PAGES), input, prefix], { timeout: TIMEOUT_MS, maxBuffer: 1 << 20 });
    } catch (e) {
      if (e.killed || e.signal) throw new PdfError('This PDF took too long to convert. Try a smaller one.');
      throw new PdfError('This PDF could not be converted. It may be damaged or use something unsupported.');
    }
    const files = (await readdir(dir)).filter((f) => /^page-\d+\.jpg$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!files.length) throw new PdfError('This PDF could not be converted.');

    const id = uuidv4();
    const pageFilenames = [];
    let width; let height;
    try {
      for (let i = 0; i < files.length; i++) {
        const name = pageFilename(id, i + 1);
        pageFilenames.push(name);
        const out = await sharp(path.join(dir, files[i])).resize(box.width, box.height, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(path.join(uploadDir, name));
        if (i === 0) { width = out.width; height = out.height; }
      }
    } catch (e) {
      for (const n of pageFilenames) await rm(path.join(uploadDir, n), { force: true }).catch(() => {});
      throw new PdfError('This PDF could not be converted. It may be damaged or use something unsupported.');
    }
    return { id, filename: pageFilenames[0], pages: files.length, width, height, mediaType: 'pdf', pageFilenames };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
