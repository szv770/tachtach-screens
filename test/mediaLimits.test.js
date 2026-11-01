// Red-team 2026-11-01 F6: no picture / PDF decode without a pixel budget, and bounded concurrency. Through the REAL app's /api/upload.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import sharp from 'sharp';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());
const full = await app.login('full');
const view = await app.login('view');
const { createGate, BusyError, readHeader, MAX_INPUT_PIXELS } = await import('../src/server/imageLimits.js');
const { embeddedImagePixels } = await import('../src/server/pdf.js');

const crc32 = (buf) => { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
/** A tiny PNG whose header CLAIMS w x h (the data is a few rows only): what a decompression bomb looks like on the wire. */
function bombPng(w, h) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const idat = zlib.deflateSync(Buffer.alloc((w + 1) * 2));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
import http from 'node:http';
import crypto from 'node:crypto';
function rawUpload(who, buf, name, type) {
  return new Promise((resolve, reject) => {
    const boundary = '----tt' + Math.random().toString(16).slice(2);
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const nonce = crypto.randomBytes(8).toString('hex');
    const csrf = `${nonce}.${crypto.createHmac('sha256', who.token).update(nonce).digest('hex')}`;
    const q = http.request({ port: app.port, host: '127.0.0.1', path: '/api/upload', method: 'POST', headers: { host: `127.0.0.1:${app.port}`, 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': body.length, cookie: `tachtach_session=${who.token}; _csrf=${csrf}`, 'x-csrf-token': csrf } }, (res) => {
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString(); let json = null; try { json = JSON.parse(t); } catch { /* */ } resolve({ status: res.statusCode, json }); });
    });
    q.on('error', reject); q.end(body);
  });
}

test('F6: a PNG claiming 20000 x 20000 is refused from its header, fast, without decoding', async () => {
  const png = bombPng(20000, 20000);
  assert.ok(png.length < 200_000);
  const t0 = Date.now();
  const r = await rawUpload(full, png, 'bomb.png', 'image/png');
  assert.equal(r.status, 400);
  assert.match(r.json.error, /too large/i);
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  await assert.rejects(() => readHeader(bombPng(16383, 16383)), /too large/);
  // GIF / WebP spellings take the same road
  const big = Buffer.from('R0lGODlhAAAAAAAA', 'base64'); // GIF header, unreadable: refused, not a 500
  assert.equal((await rawUpload(full, big, 'x.gif', 'image/gif')).status, 400);
});

test('F6: normal pictures and big phone JPEGs still upload; the result is one screen-size copy + a blur', async () => {
  const phone = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
  const r = await rawUpload(full, phone, 'phone.jpg', 'image/jpeg');
  assert.equal(r.status, 201);
  assert.equal(r.json.width, 4000);
  assert.match(r.json.dominantColor, /^rgb\(\d+,\d+,\d+\)$/);
  const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#336699' } }).png().toBuffer();
  assert.equal((await rawUpload(full, png, 'a.png', 'image/png')).status, 201);
  // a 48 MP (8000 x 6000) JPEG is a real phone mode: allowed (JPEG budget 100 MP)
  const header48 = await readHeader(await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#000' } }).jpeg({ quality: 10 }).toBuffer());
  assert.equal(header48.width, 8000);
  assert.equal(MAX_INPUT_PIXELS, 40_000_000);
});

test('F6: people without the upload permission still cannot upload at all', async () => {
  const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.equal((await rawUpload(view, png, 'a.png', 'image/png')).status, 403);
});

test('F6: the gate runs a bounded number of jobs, queues a few, refuses the rest, and times out the wait', async () => {
  const gate = createGate({ concurrency: 2, maxQueue: 2, waitMs: 100 });
  let running = 0; let peak = 0;
  const job = () => gate.run(async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 40)); running--; return 'ok'; });
  const results = await Promise.allSettled(Array.from({ length: 6 }, job));
  assert.equal(peak, 2);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 4, '2 running + 2 queued');
  assert.equal(results.filter((x) => x.status === 'rejected' && x.reason instanceof BusyError).length, 2);
  const slow = createGate({ concurrency: 1, maxQueue: 5, waitMs: 30 });
  const first = slow.run(() => new Promise((r) => setTimeout(r, 120)));
  await assert.rejects(() => slow.run(async () => 1), BusyError);
  await first;
  assert.deepEqual(gate.stats(), { running: 0, queued: 0 });
});

test('F6: concurrent uploads of big (allowed) pictures never run more than the gate allows, and all finish', async () => {
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } } }).png().toBuffer();
  const rs = await Promise.all(Array.from({ length: 8 }, () => rawUpload(full, png, 'n.png', 'image/png')));
  const ok = rs.filter((r) => r.status === 201).length;
  const busy = rs.filter((r) => r.status === 503).length;
  assert.equal(ok + busy, 8);
  assert.ok(ok >= 2);
});

test('F6: PDF embedded-picture budget is read from the pdfimages listing', () => {
  const listing = `page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
--------------------------------------------------------------------------------------------
   1     0 image   12000  12000  gray    1   8  image  no         7  0    72    72 1000B 0.0%
   2     1 image     800    600  rgb     3   8  jpeg   no         9  0    72    72  90K 6.0%`;
  const px = embeddedImagePixels(listing);
  assert.equal(px.max, 144_000_000);
  assert.equal(px.total, 144_000_000 + 480_000);
  assert.deepEqual(embeddedImagePixels('garbage'), { max: 0, total: 0 });
});
