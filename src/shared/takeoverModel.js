/**
 * announcement item -> the content "model" each takeover layout draws
 * (docs/design/2026-10-14-takeovers-r3/README.md: sample content, fit rules).
 * Pure (no DOM, no React) so it is unit-tested in node and shared by the
 * kiosk and the admin's live preview.
 *
 * Models (all strings optional unless noted):
 *   bigwords  { kick:[en,he], he, en, sub:[en,he] }
 *   event     { kick, he, en, when:[en,he], time:[t,ap]|null, place:{en,en2,he} }
 *   list      { hd:[en,he], items:[{d,en,he,t:[t,ap]|null,soon}], nod }
 *   quick     { kick, name:[en,he], pre, times:[[t,ap,labEn,labHe]], big:[num,label], was, where:[en,he] }
 *   quote     { he, en, attr:[en,he] }
 *   sicha     { title:[en,he], body:[paragraph,...], source }
 *   notice    { kick, pre:[en,he], focus:[en,he], post:[en,he] }
 *   letter    { top:[line,...], sal, close, body:[paragraph,...], source:[en,he], rtl }
 */

const S = (v) => String(v ?? '').trim();
const has = (v) => !!S(v);
const HEB = /[֐-׿]/;
export const isHeb = (v) => HEB.test(String(v ?? ''));

/** "13:45" -> ['1:45','PM']; "1:45 PM" (already 12h) passes through; '' -> null. */
export function splitTime(hhmm) {
  const t = S(hhmm);
  if (!t) return null;
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const h = +m[1] % 24;
    return [`${h % 12 === 0 ? 12 : h % 12}:${m[2]}`, h < 12 ? 'AM' : 'PM'];
  }
  m = /^(\d{1,2}:\d{2})\s*([AP])\.?M\.?$/i.exec(t);
  if (m) return [m[1], `${m[2].toUpperCase()}M`];
  return [t, ''];
}

const kickOf = (c) => {
  const en = S(c.target), he = S(c.targetHe);
  return en || he ? [en, he] : null;
};

/** Split a sicha/letter body into paragraphs (blank line or newline). */
export function paragraphs(text) {
  return String(text ?? '').split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

/** One list row: a plain string (old data) or { text, textHe, day, time }. */
export function listRow(raw) {
  if (raw && typeof raw === 'object') {
    return { d: S(raw.day), en: S(raw.text), he: S(raw.textHe), t: splitTime(raw.time) };
  }
  const lines = String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { d: '', en: '', he: '', t: null };
  if (isHeb(lines[0]) && !lines.some((l) => !isHeb(l))) return { d: '', en: '', he: lines.join(' '), t: null };
  const heLine = lines.slice(1).find(isHeb) || '';
  const en = lines.filter((l) => l !== heLine).join(' ');
  return { d: '', en, he: heLine, t: null };
}

export function modelBigWords(item) {
  const c = item.content || {};
  const hasHead = has(c.headlineHe) || has(c.headlineEn);
  const he = hasHead ? S(c.headlineHe) : S(c.bodyHe);
  const en = hasHead ? S(c.headlineEn) : S(c.bodyEn);
  const enParts = [hasHead ? S(c.bodyEn) : '', S(c.subtitle), has(c.attribution) ? `— ${S(c.attribution)}` : ''].filter(Boolean);
  const heSub = hasHead ? S(c.bodyHe) : '';
  // Hebrew typed into the English field (and no Hebrew line): draw it in the Hebrew slot (RTL, Hebrew display font)
  if (!he && /^[^A-Za-z]*[\u0590-\u05FF]/.test(en)) return { kick: kickOf(c), he: en, en: '', sub: enParts.length || heSub ? [enParts.join(' · '), heSub] : null };
  return { kick: kickOf(c), he, en, sub: enParts.length || heSub ? [enParts.join(' · '), heSub] : null };
}

export function modelEvent(item) {
  const c = item.content || {};
  const e = c.event || {};
  let dayEn = S(e.day), dayHe = S(e.dayHe);
  if (dayEn && !dayHe && isHeb(dayEn)) { dayHe = dayEn; dayEn = ''; }
  const time = splitTime(e.time);
  const place = has(e.place) || has(e.placeHe) || has(e.place2) ? { en: S(e.place), en2: S(e.place2), he: S(e.placeHe) } : null;
  let tHe = S(e.titleHe), tEn = S(e.title);
  if (!tHe && isHeb(tEn) && /^[^A-Za-z]*[\u0590-\u05FF]/.test(tEn)) { tHe = tEn; tEn = ''; }
  return {
    kick: kickOf(c), he: tHe, en: tEn,
    when: dayEn || dayHe ? [dayEn, dayHe] : null, time, place,
  };
}

export function modelList(item) {
  const l = item.content?.list || {};
  const rows = (l.items || []).map(listRow).filter((r) => r.en || r.he).slice(0, 8);
  const anyD = rows.some((r) => r.d), anyT = rows.some((r) => r.t);
  const first = rows.findIndex((r) => r.d || r.t);
  return {
    hd: [S(l.heading), S(l.headingHe)],
    items: rows.map((r, i) => ({ ...r, soon: i === first && first >= 0 })),
    nod: !anyD, anyT,
  };
}

import { minutesFromSplit } from './quickCountdown.js';

export function modelQuick(item) {
  const c = item.content || {};
  const q = c.quicktime || {};
  const times = [];
  const t1 = splitTime(q.time), t2 = splitTime(q.time2);
  if (t1) times.push([...t1, S(q.label), S(q.labelHe)]);
  if (t2) times.push([...t2, S(q.label2), S(q.label2He)]);
  const was = splitTime(q.was);
  const big = has(q.big) ? [S(q.big), S(q.bigLabel)] : null;
  return {
    kick: kickOf(c), name: [S(q.name), S(q.nameHe)], pre: S(q.pre),
    times: big ? [] : times, big, was: was ? was.join(' ').trim() : '',
    where: has(q.place) || has(q.placeHe) ? [S(q.place), S(q.placeHe)] : null,
    // live "starts in ..." line: one real time, no big number, not switched off
    cd: !big && times.length === 1 && q.countdown !== false ? minutesFromSplit(t1) : null,
    cdHe: !S(q.name) && !!S(q.nameHe),
  };
}

export function modelQuote(item) {
  const q = item.content?.quote || {};
  return { he: S(q.textHe), en: S(q.text), attr: [S(q.source), S(q.sourceHe)] };
}

export function modelSicha(item) {
  const s = item.content?.sicha || {};
  return { title: [S(s.title), S(s.titleHe)], body: paragraphs(s.body), source: S(s.source) };
}

export function modelLetter(item) {
  const l = item.content?.letter || {};
  const rtl = isHeb(l.body) || (!has(l.body) && (isHeb(l.salutation) || has(l.dateHe)));
  const dateLine = [S(l.dateHe), S(l.date)].filter(Boolean).join(' · ');
  return {
    top: [rtl ? 'ב״ה' : '', dateLine].filter(Boolean), sal: S(l.salutation), close: S(l.signature),
    body: paragraphs(l.body), source: [S(l.source), S(l.sourceHe)], rtl,
  };
}

/**
 * notice (quick messages): small line above, one BIG focus (a name, a time...),
 * small line below. Each is [en, he]; Hebrew typed into an English slot moves
 * to the Hebrew slot, like Big words does.
 */
export function modelNotice(item) {
  const n = item.content?.notice || {};
  const slot = (en, he) => {
    let e = S(en), h = S(he);
    if (!h && e && /^[^A-Za-z]*[\u0590-\u05FF]/.test(e)) { h = e; e = ''; }
    return [e, h];
  };
  return { kick: kickOf(item.content || {}), pre: slot(n.pre, n.preHe), focus: slot(n.focus, n.focusHe), post: slot(n.post, n.postHe) };
}

/** layout name used by the stage ('quicktime' -> 'quick'; unknown / 'classic' -> bigwords). */
export function stageLayout(layout) {
  if (layout === 'quicktime') return 'quick';
  return ['bigwords', 'event', 'list', 'quick', 'quote', 'sicha', 'letter', 'notice'].includes(layout) ? layout : 'bigwords';
}

export function modelFor(item, layout) {
  switch (stageLayout(layout)) {
    case 'event': return modelEvent(item);
    case 'list': return modelList(item);
    case 'quick': return modelQuick(item);
    case 'quote': return modelQuote(item);
    case 'sicha': return modelSicha(item);
    case 'letter': return modelLetter(item);
    case 'notice': return modelNotice(item);
    default: return modelBigWords(item);
  }
}
