import React, { useEffect, useState } from 'react';
import { Panel, F, he } from '../../design/ui.jsx';
import PagedBody from '../../design/Paged.jsx';
import ReaderBody from '../../design/Reader.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { prefersReducedMotion } from '../../design/reader.js';
import { READER, longTextSettings, readerMode, readerSlideSeconds, scrollSeconds, wpmFor } from '../../../shared/longText.js';
import { hebrewDateText } from '../Rail.jsx';
import SourceCredit, { NOT_IN_PACK } from '../SourceCredit.jsx';

/**
 * Hayom Yom — the "Sicha" reading look (R2 §6 Inspiration): Torah-text font at
 * a fixed readable size that never shrinks; longer text paginates at sentence
 * ends and the slide's duration grows to fit its pages. settings.hayomYomLang
 * 'both' shows English and Hebrew side by side, paged in step.
 *
 * Long text (settings.longText, default Scroll): text that fits (after a small
 * shrink, ReaderBody) just shows; text that does not becomes ONE slide with a slow
 * smooth scroll (hold, ease, steady reading speed, hold; both columns together).
 * Pages stay as the fallback for Minimal motion / "Pages" / reduced motion.
 */
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const PAGE_SECONDS = 12;

// Strip the date/shiurim preamble from Hayom Yom Hebrew text.
// Removes: "יום ראשון יא אייר, ... שיעורים: חומש: ... תניא: some text."
export function stripHayomPreamble(text) {
  if (!text) return text;
  const shiurimIdx = text.indexOf('שיעורים:'); // שיעורים:
  if (shiurimIdx === -1) return text;
  // Find תניא: after שיעורים: and take everything after its first period
  const tanyaMarker = 'תניא:'; // תניא:
  const tanyaIdx = text.indexOf(tanyaMarker, shiurimIdx);
  let result;
  if (tanyaIdx !== -1) {
    const searchWindow = text.slice(tanyaIdx, tanyaIdx + 80);
    const lastDotInWindow = searchWindow.lastIndexOf('.');
    if (lastDotInWindow !== -1) {
      result = text.slice(tanyaIdx + lastDotInWindow + 1).trim();
    }
  }
  if (!result) {
    // Fallback: skip 3 periods from שיעורים:
    let pos = shiurimIdx, dots = 0;
    while (pos < text.length && dots < 3) { if (text[pos] === '.') dots++; pos++; }
    result = dots === 3 ? text.slice(pos).trim() : text;
  }
  // Strip any stray leading period(s) that can appear from typesetting artifacts
  return result.replace(/^[.\s]+/, '');
}

export default function HayomYomSlide({ cache, settings, onRequestDuration }) {
  const hy = cache?.hayomYom || {};
  const hd = cache?.hebrewDate || {};
  const lang = settings?.hayomYomLang || 'both';
  const showHe = lang === 'hebrew' || lang === 'both';
  const showEn = lang === 'english' || lang === 'both';
  const both = showHe && showEn;
  const heText = showHe ? stripHayomPreamble(hy.he) : '';
  const enText = showEn ? hy.en : '';
  const { motion } = useDesign();
  const lt = longTextSettings(settings);
  const scrolling = readerMode({ mode: lt.mode, motion, reduced: prefersReducedMotion() }) === 'scroll';
  const [infos, setInfos] = useState({ en: null, he: null });
  const setInfo = (k) => (i) => setInfos((p) => (p[k] === i ? p : { ...p, [k]: i }));
  const shown = [showEn && enText ? 'en' : null, showHe && heText ? 'he' : null].filter(Boolean);
  const readerReady = scrolling && shown.every((k) => infos[k]);
  const overs = readerReady ? shown.filter((k) => infos[k].over) : [];
  const scrollSec = overs.length
    ? Math.max(...overs.map((k) => scrollSeconds({ words: infos[k].words, distance: infos[k].distance, contentH: infos[k].contentH, wpm: wpmFor(lt.speed, k) })))
    : 0;
  const [heCount, setHeCount] = useState(1);
  const [enCount, setEnCount] = useState(1);
  const [page, setPage] = useState(0);
  const total = Math.max(heCount, enCount, 1);

  useEffect(() => {
    if (scrolling) { onRequestDuration?.(scrollSec ? readerSlideSeconds(READER.holdTop + scrollSec + READER.holdEnd, 13) : 13); return; }
    onRequestDuration?.(Math.max(13, total * PAGE_SECONDS + 2));
  }, [total, scrolling, scrollSec]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (total < 2) { setPage(0); return undefined; }
    const id = setInterval(() => setPage((p) => (p + 1) % total), PAGE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [total]);

  const day = HE_DAYS[new Date().getDay()];
  const idx = (count) => Math.min(count - 1, Math.floor((page / total) * count));
  const size = both ? 31 : 39;

  if (!heText && !enText) {
    // 'missing' = Local mode and the data pack has nothing for today; 'none' = the pack says this day has no entry
    return <Panel><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--inkDim)', fontFamily: F.en, fontSize: 30 }}>{hy.missing ? NOT_IN_PACK : hy.none ? 'No Hayom Yom for today' : 'No Hayom Yom available'}</div></Panel>;
  }
  return (
    <Panel pad="44px 64px 40px">
      <header data-s="" style={{ '--i': 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 20, borderBottom: '2px solid var(--line)', flex: 'none', gap: 24 }}>
        <span style={{ fontFamily: 'var(--f-te)', fontSize: 46, fontWeight: 600, letterSpacing: '-.01em' }}>Hayom Yom</span>
        <span className="tt-he" style={{ fontFamily: 'var(--f-th)', fontSize: he(40), fontWeight: 500, color: 'var(--inkDim)' }}>
          {day ? `היום יום · יום ${day}` : 'היום יום'}
        </span>
      </header>
      <div data-s="" style={{ '--i': 1, flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: both ? '1fr 1fr' : '1fr', columnGap: 56, marginTop: 28 }}>
        {showEn && enText && (scrolling ? (
          <ReaderBody text={enText} scrollSec={scrollSec} onMeasure={setInfo('en')} style={{ fontFamily: 'var(--f-te)', fontSize: size, lineHeight: 1.5, textWrap: 'pretty' }} />
        ) : (
          <PagedBody text={enText} page={both ? idx(enCount) : page} onPages={setEnCount} style={{ fontFamily: 'var(--f-te)', fontSize: size, lineHeight: 1.5, textWrap: 'pretty' }} />
        ))}
        {showHe && heText && (scrolling ? (
          <ReaderBody text={heText} dir="rtl" scrollSec={scrollSec} onMeasure={setInfo('he')} style={{ fontFamily: 'var(--f-th)', fontSize: `calc(${size - 1}px * var(--he-scale))`, lineHeight: 1.55, textAlign: 'right', textWrap: 'pretty' }} />
        ) : (
          <PagedBody text={heText} dir="rtl" page={both ? idx(heCount) : page} onPages={setHeCount} style={{ fontFamily: 'var(--f-th)', fontSize: `calc(${size - 1}px * var(--he-scale))`, lineHeight: 1.55, textAlign: 'right', textWrap: 'pretty' }} />
        ))}
      </div>
      <footer style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, fontFamily: F.en, fontSize: 26, color: 'var(--inkDim)', fontWeight: 500 }}>
        <span className="tt-he" style={{ fontFamily: 'var(--f-th)' }}>{hebrewDateText(hd)}</span>
        <SourceCredit settings={settings} cache={cache} inline />
        {total > 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="tt-num">{page + 1} / {total}</span>
            {Array.from({ length: total }, (_, k) => <i key={k} style={{ width: 34, height: 5, borderRadius: 3, background: k === page ? 'var(--accentText)' : 'var(--line)' }} />)}
          </span>
        )}
      </footer>
    </Panel>
  );
}
