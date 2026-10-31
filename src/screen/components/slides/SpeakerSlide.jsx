import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { DEFAULT_SETTINGS, guestsActive, minutesToStart, startsInWords, pickLang } from '../../../shared/shiurim.js';
import { WORDS } from '../../../shared/shiurimCopy.js';
import { GUEST_SECONDS, guestPages } from '../../../shared/shiurimPages.js';
import { Avatar, useFontsKey } from './shiurim/ui.jsx';
import QrImage from './shiurim/QrImage.jsx';

/**
 * Guest speaker (spec docs/specs/06-SPEAKER-SHIURIM.md 4.3): a hero card with the photo (a letter circle when there is none), the
 * name as big as fits, the topic, WHEN (the key fact: 'Thursday · 8:15 PM', 'Tonight', 'Now') and where, a countdown on the day,
 * a short bio only if it fits at 30 px, and an optional QR code. One guest fills the page; two sit side by side (stacked in
 * portrait); more than two page through in twos. Text auto-fits, never cut. Roles and font roles only; entrances are the page
 * transition, nothing loops.
 */

const SIZES = {
  single: { dir: 'row', photoW: 440, photoH: 540, nameMax: 96, nameMin: 56, topicMax: 48, topicMin: 34, when: 52, place: 40, bio: 30, bioLines: 4, qr: 200, kicker: 32 },
  singleP: { dir: 'col', photoW: 380, photoH: 420, nameMax: 88, nameMin: 52, topicMax: 44, topicMin: 34, when: 50, place: 38, bio: 30, bioLines: 4, qr: 180, kicker: 30 },
  double: { dir: 'col', photoW: 280, photoH: 280, nameMax: 64, nameMin: 44, topicMax: 40, topicMin: 32, when: 44, place: 34, bio: 30, bioLines: 3, qr: 140, kicker: 26 },
  doubleP: { dir: 'row', photoW: 220, photoH: 280, nameMax: 60, nameMin: 44, topicMax: 38, topicMin: 32, when: 42, place: 32, bio: 30, bioLines: 3, qr: 130, kicker: 26 },
};

/** Draws the bio only when it fits whole at its size (otherwise it is left out, never cut). */
function Bio({ text, size, lines, sig }) {
  const ref = useRef(null);
  const [ok, setOk] = useState(true);
  useLayoutEffect(() => {
    setOk(true);
  }, [sig]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) setOk(false);
  }, [sig, ok]);
  if (!text) return null;
  return (
    <div ref={ref} data-bio="" style={{ flex: 'none', maxHeight: Math.round(size * 1.3 * lines), overflow: 'hidden', ...(ok ? null : { display: 'none' }) }}>
      <div dir={textDir(text)} style={{ fontFamily: textDir(text) === 'rtl' ? F.he : F.en, fontSize: textDir(text) === 'rtl' ? he(size) : size, fontWeight: 500, lineHeight: 1.3, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{bidiNodes(text)}</div>
    </div>
  );
}

function Hero({ item, S, settings, now, tz }) {
  const { guest: g, phase, whenWords: ww } = item;
  const lang = settings.language;
  const [n1, n2] = pickLang(g.name, g.nameHe, lang);
  const [t1, t2] = pickLang(g.topic, g.topicHe, lang);
  const [p1, p2] = settings.showPlace ? pickLang(g.place, g.placeHe, lang) : ['', ''];
  const kickEn = g.title || WORDS.guest.en;
  const kickHe = g.titleHe || (g.title ? '' : WORDS.guest.he);
  const mins = minutesToStart(g, now, tz);
  const cd = phase === 'today' && mins != null ? startsInWords(mins) : null;
  const bioText = settings.guestBio ? pickLang(g.bio, g.bioHe, lang)[0] : '';
  const qr = settings.guestQr && g.link ? g.link : '';
  const photo = settings.showPhotos ? g.photo : null;
  const row = S.dir === 'row';
  const nameText = [n1, n2];
  const sig = `${g.id}|${n1}|${t1}|${bioText}|${S.dir}|${p1}|${ww.en}`;
  return (
    <section data-guest="" style={{
      boxSizing: 'border-box', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: row ? 'row' : 'column', gap: row ? 40 : 22, padding: row ? '24px 30px' : '22px 26px',
      borderRadius: 28, border: `${phase === 'now' ? 4 : 2}px solid ${phase === 'now' ? 'var(--accentText)' : 'var(--line)'}`,
      background: 'color-mix(in srgb, var(--ink) 5%, transparent)', overflow: 'hidden',
    }}>
      <div style={{ flex: 'none', alignSelf: row ? 'center' : 'flex-start' }}>
        <Avatar photo={photo} name={g.name || g.nameHe} shape="rect" width={S.photoW} height={S.photoH} letterSize={Math.round(Math.min(S.photoW, S.photoH) * 0.5)} />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 22px', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accentText)' }}>
          <span dir={textDir(kickEn)} style={{ fontFamily: F.en, fontSize: S.kicker }}>{bidiNodes(kickEn)}</span>
          {kickHe && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: he(S.kicker), letterSpacing: 0 }}>{kickHe}</span>}
        </div>
        <div style={{ flex: '3 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nameText[0] && <Fit key={`n1|${sig}`} wrap max={S.nameMax} min={S.nameMin} style={{ flex: nameText[1] ? '3 1 0' : '1 1 0', minHeight: 0, width: '100%', fontFamily: textDir(nameText[0]) === 'rtl' ? F.heD : F.enD, fontWeight: 760, color: 'var(--ink)', letterSpacing: '-.01em' }}>{nameText[0]}</Fit>}
          {nameText[1] && <Fit key={`n2|${sig}`} wrap max={Math.round(S.nameMax * 0.8)} min={Math.round(S.nameMin * 0.7)} dir="rtl" className="tt-he" style={{ flex: '2 1 0', minHeight: 0, width: '100%', fontFamily: F.heD, fontWeight: 700, color: 'var(--ink)', textAlign: 'start' }}>{nameText[1]}</Fit>}
        </div>
        {(t1 || t2) && (
          <div style={{ flex: '2 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {t1 && <Fit key={`t1|${sig}`} wrap max={S.topicMax} min={S.topicMin} style={{ flex: '1 1 0', minHeight: 0, width: '100%', fontFamily: textDir(t1) === 'rtl' ? F.he : F.en, fontWeight: 560, color: 'var(--ink)', lineHeight: 1.2 }}>{t1}</Fit>}
            {t2 && <Fit key={`t2|${sig}`} wrap max={Math.round(S.topicMax * 0.9)} min={Math.round(S.topicMin * 0.9)} dir="rtl" className="tt-he" style={{ flex: '1 1 0', minHeight: 0, width: '100%', fontFamily: F.he, fontWeight: 520, color: 'var(--ink)', textAlign: 'start' }}>{t2}</Fit>}
          </div>
        )}
        <Bio text={bioText} size={S.bio} lines={S.bioLines} sig={sig} />
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 22px' }}>
              <span className="tt-num" style={{ fontFamily: F.en, fontSize: S.when, fontWeight: 780, color: 'var(--ink)', lineHeight: 1.15 }}>{ww.en}</span>
              {lang !== 'en' && ww.he && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: he(Math.round(S.when * 0.9)), fontWeight: 700, color: 'var(--ink)' }}>{ww.he}</span>}
            </div>
            {(p1 || p2) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 22px', fontSize: S.place, fontWeight: 560, color: 'var(--ink)', lineHeight: 1.2 }}>
                {p1 && <span dir={textDir(p1)} style={{ fontFamily: textDir(p1) === 'rtl' ? F.he : F.en }}>{bidiNodes(p1)}</span>}
                {p2 && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: he(Math.round(S.place * 0.95)) }}>{p2}</span>}
              </div>
            )}
            {cd && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 22px', fontSize: Math.round(S.place * 0.95), fontWeight: 650, color: 'var(--accentText)' }}>
                <span style={{ fontFamily: F.en }}>{cd.en}</span>
                {lang !== 'en' && <span dir="rtl" className="tt-he" style={{ fontFamily: F.he, fontSize: he(Math.round(S.place * 0.9)) }}>{cd.he}</span>}
              </div>
            )}
          </div>
          {qr && (
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <QrImage url={qr} size={S.qr} />
              <span style={{ fontFamily: F.en, fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>{WORDS.linkNote.en}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function SpeakerSlide({ data, now, tz, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  useFontsKey();
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data?.settings || {}) }), [data?.settings]);
  const active = useMemo(() => { try { return data ? guestsActive(data, now || new Date(), tz) : []; } catch { return []; } }, [data, now, tz]);
  const pages = useMemo(() => guestPages(active), [active]);
  const n = pages.length;
  const [step, setStep] = useState(0);
  const base = Number(slide?.duration) || 0;
  const total = n * GUEST_SECONDS + 2;
  const nRef = useRef(n);
  nRef.current = n;
  const idKey = active.map((x) => x.guest.id).join('|');
  useEffect(() => { setStep(0); }, [idKey]);
  useEffect(() => { if (n > 1 && onRequestDuration && total > Math.max(base, 0)) onRequestDuration(total); }, [total, n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setTimeout(() => setStep((x) => (x + 1) % Math.max(1, nRef.current)), GUEST_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [step, n < 2]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) return null;
  const at = Math.min(step, n - 1);
  const fade = design.motion === 'minimal' ? 'none' : 'opacity 500ms ease';
  return (
    <Panel pad={portrait ? '30px 32px 28px' : '26px 36px 26px'}>
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
        {pages.map((list, i) => {
          const two = list.length > 1;
          const S = SIZES[two ? (portrait ? 'doubleP' : 'double') : (portrait ? 'singleP' : 'single')];
          return (
            <div key={i} style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: two && portrait ? 'column' : 'row', gap: 20,
              opacity: i === at ? 1 : 0, visibility: i === at ? 'visible' : 'hidden', transition: fade,
            }}>
              {list.map((item) => <Hero key={item.guest.id} item={item} S={S} settings={settings} now={now || new Date()} tz={tz} />)}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
