/**
 * Takeover layouts: model (src/shared/takeoverModel.js) -> HTML string.
 * Ported from docs/design/2026-10-14-takeovers-r3/takeovers.html with the
 * extra care real content needs (HTML-escaped text, optional pieces, single
 * language, newline -> <br>). Fitting happens afterwards in fit.js.
 *
 * Fit rules (README "Fit rules"): [max, min] canvas px per text slot; Hebrew
 * display slots are multiplied by --he-scale by fit.js.
 */

export const FIT = {
  bwHe: [300, 64], bwEn: [84, 34], bwEnOnly: [170, 34], bwSub: [32, 22], kick: [34, 22],
  evHe: [230, 44], evEn: [170, 32], lsHdEn: [64, 28], lsHdHe: [58, 28],
  qtBig: [330, 110], qHe: [220, 48], qEn: [64, 28], attr: [30, 22], scHdEn: [44, 28], scHdHe: [40, 24], where: [36, 24],
};
import { slotDir, takeoverRuns as bidiRuns, dirAttr } from '../../shared/bidi.js';

const fa = (k, extra = '') => `data-max="${FIT[k][0]}" data-min="${FIT[k][1]}"${extra}`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/*
 * BIDI (docs/claude/GOTCHAS.md "Hebrew punctuation side"): every text element
 * gets dir="rtl" / dir="ltr" from its own content (src/shared/bidi.js), so a
 * trailing "!" / "?" on a Hebrew line sits at its LEFT end even though the
 * stage itself is LTR. Hebrew runs inside an LTR (English-first) string are
 * isolated as their own RTL spans. css.js makes every [dir] isolate.
 */
const D = (s, lang) => dirAttr(slotDir(s, lang));
/** Escaped text, Hebrew runs isolated when the line reads LTR. */
const ex = (s, lang) => {
  const dir = slotDir(s, lang);
  return bidiRuns(String(s ?? ''), dir).map((r) => (r.dir ? `<span dir="${r.dir}">${esc(r.text)}</span>` : esc(r.text))).join('');
};
/** Same, where admin-typed newlines become line breaks. */
const eb = (s, lang) => String(s ?? '').split(/\r?\n/).map((line) => ex(line, lang)).join('<br>');

const T = (t, ap) => `${esc(t)}${ap ? `<small>${esc(ap)}</small>` : ''}`;
const kick = (k) => (k && (k[0] || k[1])
  ? `<div class="fit nw kick" ${fa('kick')} data-s style="--i:0">${k[0] ? `<span${D(k[0], 'en')}>${ex(k[0], 'en')}</span>` : ''}${k[0] && k[1] ? '<i class="dot"></i>' : ''}${k[1] ? `<span class="he"${D(k[1], 'he')}>${ex(k[1], 'he')}</span>` : ''}</div>`
  : '');
const pair = (en, he) => `${en ? `<span${D(en, 'en')}>${eb(en, 'en')}</span>` : ''}${en && he ? ' <i class="dot" style="display:inline-block;margin:0 14px 4px"></i> ' : ''}${he ? `<span class="he"${D(he, 'he')}>${eb(he, 'he')}</span>` : ''}`;

export const LAYOUT_HTML = {
  bigwords: (m) => {
    const onlyHe = m.he && !m.en, onlyEn = m.en && !m.he;
    return `<div class="lyt bw${onlyHe ? ' only-he' : ''}${onlyEn ? ' only-en' : ''}">${kick(m.kick)}
    ${m.he ? `<div class="fit wrap w-he disp-he" ${fa('bwHe')}${D(m.he, 'he')} data-s style="--i:1">${eb(m.he, 'he')}</div>` : ''}
    ${m.en ? `<div class="fit wrap w-en" ${fa(onlyEn ? 'bwEnOnly' : 'bwEn')}${D(m.en, 'en')} data-s style="--i:2">${eb(m.en, 'en')}</div>` : ''}
    ${m.sub ? `<div class="fit wrap sub" ${fa('bwSub', ' data-h="112"')} data-s style="--i:3">${pair(m.sub[0], m.sub[1])}</div>` : ''}</div>`;
  },

  event: (m) => {
    const onlyHe = m.he && !m.en, onlyEn = m.en && !m.he;
    const tile = m.time || m.when
      ? `<div class="tile ${m.when ? '' : 'only'}${m.time ? '' : ' dayonly'}" data-s style="--i:3">${m.when ? `<div class="when"><div class="day"${D(m.when[0], 'en')}>${ex(m.when[0], 'en')}</div><div class="day he"${D(m.when[1], 'he')}>${ex(m.when[1], 'he')}</div></div>` : ''}${m.time ? `<div class="t num">${T(...m.time)}</div>` : ''}</div>`
      : '';
    const place = m.place
      ? `<div class="place" data-s style="--i:4">${m.place.en ? `<div class="en"${D(m.place.en, 'en')}>${eb(m.place.en, 'en')}</div>` : ''}${m.place.en2 ? `<div class="en2"${D(m.place.en2, 'en')}>${eb(m.place.en2, 'en')}</div>` : ''}${m.place.he ? `<div class="he"${D(m.place.he, 'he')}>${eb(m.place.he, 'he')}</div>` : ''}</div>`
      : '';
    return `<div class="lyt ev"><div class="titles${onlyHe ? ' only-he' : ''}${onlyEn ? ' only-en' : ''}">${kick(m.kick)}
      ${m.he ? `<div class="fit wrap h-he disp-he" ${fa('evHe')}${D(m.he, 'he')} data-s style="--i:1">${eb(m.he, 'he')}</div>` : ''}
      ${m.en ? `<div class="fit wrap h-en disp-en" ${fa('evEn')}${D(m.en, 'en')} data-s style="--i:2">${eb(m.en, 'en')}</div>` : ''}</div>
    ${tile || place ? `<div class="foot">${tile}${place}</div>` : ''}</div>`;
  },

  list: (m) => {
    const hd = m.hd && (m.hd[0] || m.hd[1])
      ? `<div class="hd" data-s style="--i:0">${m.hd[0] ? `<span class="fit wrap en disp-en" ${fa('lsHdEn', ' data-h="150"')}${D(m.hd[0], 'en')}>${eb(m.hd[0], 'en')}</span>` : ''}${m.hd[1] ? `<span class="fit wrap he disp-he" ${fa('lsHdHe', ' data-h="150"')}${D(m.hd[1], 'he')}>${eb(m.hd[1], 'he')}</span>` : ''}</div>`
      : '';
    const rows = m.items.map((r, i) => {
      const heOnly = !r.en && r.he;
      const x = heOnly ? `<span class="x hx"${D(r.he, 'he')}>${eb(r.he, 'he')}</span>` : `<span class="x"><span class="xl"${D(r.en, 'en')}>${eb(r.en, 'en')}</span>${r.he ? `<span class="he"${D(r.he, 'he')}>${eb(r.he, 'he')}</span>` : ''}</span>`;
      const tm = r.t ? `<span class="tm num">${esc(r.t[0])}${r.t[1] ? `<small>${esc(r.t[1])}</small>` : ''}</span>` : '<span class="tm"></span>';
      return `<div class="li ${m.nod ? 'nod' : ''} ${r.soon ? 'soon' : ''}" data-s style="--i:${i + 1}">${m.nod ? '' : `<span class="d ${r.soon ? 'soon' : ''}"${D(r.d, 'en')}>${ex(r.d, 'en')}</span>`}${x}${tm}</div>`;
    }).join('');
    return `<div class="lyt ls">${hd}<div class="items">${rows}</div></div>`;
  },

  quick: (m) => {
    const name = m.name && (m.name[0] || m.name[1])
      ? `<div class="nm" data-s style="--i:1">${m.name[1] ? `<span class="he disp-he"${D(m.name[1], 'he')}>${ex(m.name[1], 'he')}</span>` : ''}${m.name[0] ? `<span class="en disp-en"${D(m.name[0], 'en')}>${ex(m.name[0], 'en')}</span>` : ''}</div>`
      : '';
    let mid = '';
    if (m.big) mid = `<div class="pw"><div class="fit nw big num" ${fa('qtBig')} data-s style="--i:2">${esc(m.big[0])}${m.big[1] ? `<small>${esc(m.big[1])}</small>` : ''}</div></div>`;
    else if (m.times.length > 1) {
      mid = `<div class="times">${m.times.map(([t, ap, en, he], i) => `<div class="tcol" data-s style="--i:${i + 2}"><div class="lab"><span class="he"${D(he, 'he')}>${ex(he, 'he')}</span><span class="en"${D(en, 'en')}>${ex(en, 'en')}</span></div><div class="t num">${T(t, ap)}</div></div>`).join('')}</div>`;
    } else if (m.times.length === 1) {
      mid = `<div class="pw"><div class="fit nw big num" ${fa('qtBig')} data-s style="--i:2">${m.pre ? `<span class="pre"${D(m.pre, 'en')}>${ex(m.pre, 'en')}</span>` : ''}${T(m.times[0][0], m.times[0][1])}</div></div>`;
    }
    const was = m.was ? `<div class="was" data-s style="--i:3"><span>was</span><s class="num">${esc(m.was)}</s></div>` : '';
    const where = m.where && (m.where[0] || m.where[1]) ? `<div class="fit wrap where" ${fa('where', ' data-h="120"')} data-s style="--i:4">${pair(m.where[0], m.where[1])}</div>` : '';
    return `<div class="lyt qt">${kick(m.kick)}${name}${mid}${was}${where}</div>`;
  },

  quote: (m) => `<div class="lyt qq">${m.he ? `<div class="fit wrap q-he" ${fa('qHe')}${D(m.he, 'he')} data-s style="--i:1">${eb(m.he, 'he')}</div>` : ''}
    ${m.en ? `<div class="fit wrap q-en" ${fa('qEn')}${D(m.en, 'en')} data-s style="--i:2">${eb(m.en, 'en')}</div>` : ''}
    ${m.attr && (m.attr[0] || m.attr[1]) ? `<div class="rule" data-s style="--i:3"></div><div class="fit wrap attr" ${fa('attr', ' data-h="84"')} data-s style="--i:4">${pair(m.attr[0], m.attr[1])}</div>` : ''}</div>`,

  sicha: (m) => `<div class="lyt sc"><div class="hd" data-s style="--i:0">${m.title[0] ? `<span class="fit wrap en" ${fa('scHdEn', ' data-h="110"')}${D(m.title[0], 'en')}>${eb(m.title[0], 'en')}</span>` : ''}${m.title[1] ? `<span class="fit wrap he" ${fa('scHdHe', ' data-h="110"')}${D(m.title[1], 'he')}>${eb(m.title[1], 'he')}</span>` : ''}</div>
    <div class="body paged${m.body.length && /[֐-׿]/.test(m.body[0]) ? ' rtl' : ''}" data-s style="--i:1" data-text="${esc(m.body.join('|'))}"></div>
    <div class="ft" data-s style="--i:2"><span${D(m.source, 'en')}>${ex(m.source, 'en')}</span><span class="pg"></span></div></div>`,

  letter: (m) => `<div class="lyt lt${m.rtl ? '' : ' ltr'}"><div class="top" data-s style="--i:0">${m.top.map(esc).join('<br>')}</div>${m.sal ? `<div class="sal"${D(m.sal, m.rtl ? 'he' : 'en')} data-s style="--i:1">${ex(m.sal, m.rtl ? 'he' : 'en')}</div>` : ''}
    <div class="body paged" data-s style="--i:2" data-text="${esc(m.body.join('|'))}"></div>${m.close ? `<div class="close"${D(m.close, m.rtl ? 'he' : 'en')} data-s style="--i:3">${ex(m.close, m.rtl ? 'he' : 'en')}</div>` : ''}
    <div class="ft" data-s style="--i:4"><span style="display:flex;gap:28px;align-items:center">${esc(m.source[0])}<span class="pg"></span></span><span class="he"${D(m.source[1], 'he')} style="font-family:var(--f-th-he)">${ex(m.source[1], 'he')}</span></div></div>`,
};
