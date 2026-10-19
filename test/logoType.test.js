import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffLogoType, LOGO_EXTS } from '../src/server/logoType.js';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);

test('real images are recognised by their bytes', () => {
  assert.equal(sniffLogoType(png).ext, '.png');
  assert.equal(sniffLogoType(jpg).ext, '.jpg');
  assert.equal(sniffLogoType(webp).ext, '.webp');
  assert.ok(LOGO_EXTS.includes('.svg') && !LOGO_EXTS.includes('.html'));
});

test('HTML / script / text dressed as an image is refused', () => {
  for (const s of ['<html><script>alert(1)</script></html>', '<!doctype html><svg></svg>', 'GIF89a......', 'just text 1234567', '<?php echo 1; ?>        ']) {
    assert.equal(sniffLogoType(Buffer.from(s)), null, s);
  }
  assert.equal(sniffLogoType(Buffer.from('x')), null);
});

test('plain SVG is allowed; active SVG is refused', () => {
  const ok = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c00"/></svg>';
  assert.equal(sniffLogoType(Buffer.from(ok)).ext, '.svg');
  for (const bad of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="javascript:alert(1)"/></svg>',
  ]) assert.equal(sniffLogoType(Buffer.from(bad)), null, bad);
});
