import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { isPdfBuffer, parsePageCount, pdfScaleTo, pageFilename, extraPagesIn, clampPageSeconds, pdfTotalSeconds, pdfPageUrls, pageAt, PDF_MAX_PAGES } from '../src/shared/pdfPages.js';
import { processPdf, pdfToolsAvailable, PdfError } from '../src/server/pdf.js';

const ID = '12345678-1234-1234-1234-123456789abc';

test('isPdfBuffer only accepts real PDF bytes', () => {
  assert.equal(isPdfBuffer(Buffer.from('%PDF-1.4\n....')), true);
  assert.equal(isPdfBuffer(Buffer.from('<html>not a pdf at all</html>')), false);
  assert.equal(isPdfBuffer(Buffer.alloc(3)), false);
  assert.equal(isPdfBuffer(null), false);
});

test('parsePageCount reads pdfinfo output', () => {
  assert.equal(parsePageCount('Title: x\nPages:           12\nEncrypted:      no\n'), 12);
  assert.equal(parsePageCount('Pages: 0'), 0);
  assert.equal(parsePageCount('nothing'), 0);
});

test('pdfScaleTo uses the screen\'s larger side, kept sane', () => {
  assert.equal(pdfScaleTo({ width: 1920, height: 1080 }), 1920);
  assert.equal(pdfScaleTo({ width: 1080, height: 1920 }), 1920);
  assert.equal(pdfScaleTo({ width: 7680, height: 4320 }), 3840);
  assert.equal(pdfScaleTo({ width: 100, height: 100 }), 1920);
  assert.equal(pdfScaleTo(null), 1920);
});

test('page file names: page 1 is the library file, others are -pNN', () => {
  assert.equal(pageFilename(ID, 1), `${ID}.jpg`);
  assert.equal(pageFilename(ID, 2), `${ID}-p02.jpg`);
  assert.equal(pageFilename(ID, 12), `${ID}-p12.jpg`);
  assert.deepEqual(extraPagesIn(ID, [`${ID}.jpg`, `${ID}-p03.jpg`, `${ID}-p02.jpg`, `${ID}-blur.jpg`, `other-p02.jpg`]), [2, 3]);
  assert.deepEqual(pdfPageUrls(ID, 3), [`/uploads/${ID}.jpg`, `/uploads/${ID}-p02.jpg`, `/uploads/${ID}-p03.jpg`]);
});

test('seconds per page are clamped and the total is pages x seconds', () => {
  assert.equal(clampPageSeconds(1), 2);
  assert.equal(clampPageSeconds(9999), 300);
  assert.equal(clampPageSeconds('abc'), 10);
  assert.equal(pdfTotalSeconds(4, 8), 32);
  assert.equal(pdfTotalSeconds(0, 8), 8);
  assert.equal(PDF_MAX_PAGES, 30);
});

test('pageAt steps through the pages and wraps', () => {
  assert.equal(pageAt(0, 3, 10), 0);
  assert.equal(pageAt(9_999, 3, 10), 0);
  assert.equal(pageAt(10_000, 3, 10), 1);
  assert.equal(pageAt(30_000, 3, 10), 0);
});

function tinyPdf(pageCount) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>'];
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(' ');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  for (let i = 0; i < pageCount; i++) objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

test('processPdf rejects things that are not PDFs and too many pages (fail closed)', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tt-pdf-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => processPdf(Buffer.from('hello world, not a pdf'), { width: 1920, height: 1080 }, dir), (e) => e instanceof PdfError && /not a PDF/.test(e.message));
  if (!(await pdfToolsAvailable())) { t.skip('poppler-utils not installed'); return; }
  await assert.rejects(() => processPdf(tinyPdf(PDF_MAX_PAGES + 1), { width: 1920, height: 1080 }, dir), (e) => e instanceof PdfError && /limit is 30/.test(e.message));
  assert.deepEqual(await readdir(dir), []);
});

test('processPdf makes one picture per page, in the upload folder, and cleans its temp folder', async (t) => {
  if (!(await pdfToolsAvailable())) { t.skip('poppler-utils not installed'); return; }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tt-pdf-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const before = (await readdir(os.tmpdir())).filter((f) => f.startsWith('tt-pdf-') && !f.startsWith('tt-pdf-test-')).length;
  const r = await processPdf(tinyPdf(3), { width: 1920, height: 1080 }, dir);
  assert.equal(r.pages, 3);
  assert.equal(r.mediaType, 'pdf');
  assert.equal(r.filename, `${r.id}.jpg`);
  assert.deepEqual((await readdir(dir)).sort(), [`${r.id}-p02.jpg`, `${r.id}-p03.jpg`, `${r.id}.jpg`].sort());
  assert.ok(r.width > 0 && r.height > 0 && r.width <= 1920 && r.height <= 1080);
  const after = (await readdir(os.tmpdir())).filter((f) => f.startsWith('tt-pdf-') && !f.startsWith('tt-pdf-test-')).length;
  assert.equal(after, before);
});
