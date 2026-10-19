/**
 * Logo upload type check (audit low): the file's real type comes from its bytes, never from the
 * client's file name or Content-Type. Returns { ext, mime } or null.
 * SVG is accepted only when it carries no active content (script, event handlers, javascript:,
 * foreignObject, iframes/embeds, entities, external references); such files are refused rather than
 * "cleaned". /uploads is also served with `default-src 'none'`, so even a missed case cannot run script.
 */
export const LOGO_EXTS = ['.jpg', '.png', '.webp', '.svg'];

const SVG_ACTIVE = /<\s*(script|foreignObject|iframe|embed|object|audio|video|animate|set|handler|use)\b|\son[a-z]+\s*=|javascript:|<!ENTITY|<!DOCTYPE[^>]*\[|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|webp|gif);)[^"']/i;

export function sniffLogoType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  const head = buf.subarray(0, Math.min(buf.length, 2 * 1024 * 1024)).toString('utf8').replace(/^﻿/, '');
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head) && !SVG_ACTIVE.test(head)) {
    return { ext: '.svg', mime: 'image/svg+xml' };
  }
  return null;
}
