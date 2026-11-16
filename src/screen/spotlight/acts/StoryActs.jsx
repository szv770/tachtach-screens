import React from 'react';
import { F, he } from '../../design/ui.jsx';
import { textDir } from '../../../shared/bidi.js';
import { StoryText } from '../../components/slides/occasionParts.jsx';
import { WORDS, pick, isHe, hasText } from '../model.js';
import { Cap, Fit, useUid } from '../parts.jsx';
import { SealBadge } from '../YearsSeal.jsx';

/**
 * The STORY ACTS after the countdown (PLAN.md 2b, 3b; step 7): what happened, this day in history, the vort, the photo,
 * the story, and the DAY hero ('Today is ...' / 'Happening now', the whole day long; no 'It was' card: owner correction
 * 2026-11-16). Each act draws inside the shell's area; entrances are finite (rise / fade, <= 1.2 s); the loops are one
 * small layer each (a light running down the history line, the photo's slow zoom, the live dot).
 * Props: { sp, box, ctx } (+ holdMs for the story's pages).
 */

const dirOf = (t) => (textDir(t) === 'rtl' ? 'rtl' : 'ltr');
const SourceLine = ({ text, center }) => (text ? (
  <div className="sp-fade" style={{ '--d': '900ms', display: 'flex', alignItems: 'baseline', gap: 14, justifyContent: center ? 'center' : 'flex-start', minWidth: 0, flex: 'none' }}>
    <Cap bi={WORDS.source} lang="english" size={24} color="var(--sp-faint)" />
    <span dir={dirOf(text)} style={{ fontFamily: textDir(text) === 'rtl' ? F.he : F.en, fontSize: 24, color: 'var(--sp-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{text}</span>
  </div>
) : null);

function ActLabel({ bi, lang }) {
  return (
    <div className="sp-in" style={{ '--d': '80ms', display: 'flex', flexDirection: 'column', gap: 14, flex: 'none' }}>
      <Cap bi={bi} lang={lang} size={26} color="var(--sp-acc)" />
      <i aria-hidden className="sp-grow" style={{ '--d': '250ms', display: 'block', width: 120, height: 4, borderRadius: 2, background: 'var(--sp-acc)', transformOrigin: isHe(lang) ? 'right' : 'left' }} />
    </div>
  );
}

/** Text in the act's language(s): 'both' shows English, then Hebrew under it when both are short enough to share. */
function twoTexts(x, lang) {
  if (!x) return { en: '', he: '' };
  if (lang === 'hebrew') return { en: '', he: x.he || x.en || '' };
  if (lang === 'english') return { en: x.en || x.he || '', he: '' };
  return { en: x.en || '', he: x.he || '' };
}

export function HappenedAct({ sp, box, ctx }) {
  const x = twoTexts(sp.happened, ctx.lang);
  const p = ctx.portrait;
  const main = x.en || x.he; const second = x.en && x.he ? x.he : '';
  const mh = textDir(main) === 'rtl';
  return (
    <div data-sp-view="happened" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
      <ActLabel bi={WORDS.happened} lang={ctx.lang} />
      <div className="sp-in" style={{ '--d': '220ms', width: '100%', minHeight: 0 }}>
        <Fit text={main} max={p ? 72 : 80} min={36} maxH={box.h * (second ? 0.5 : 0.68)} lines={5} dir={dirOf(main)}
          style={{ fontFamily: mh ? F.heD : F.enD, fontWeight: 650, lineHeight: 1.16, letterSpacing: mh ? 0 : '-.01em', color: 'var(--sp-ink)' }} />
      </div>
      {second && (
        <div className="sp-in" style={{ '--d': '420ms', width: '100%' }}>
          <Fit text={second} max={48} min={28} maxH={box.h * 0.2} lines={3} dir="rtl" style={{ fontFamily: F.he, fontWeight: 500, lineHeight: 1.3, color: 'var(--sp-dim)' }} />
        </div>
      )}
      <SourceLine text={sp.happened?.source} />
    </div>
  );
}

export function HistoryAct({ sp, box, ctx }) {
  const rows = (sp.history || []).slice(0, 8);
  const p = ctx.portrait;
  const cols = !p && rows.length > 4 ? 2 : 1;
  const per = Math.ceil(rows.length / cols);
  const avail = box.h - 90;
  const rowH = Math.min(p ? 170 : 150, avail / per);
  const textSize = Math.max(24, Math.min(36, Math.floor(rowH * 0.26)));
  const yearSize = Math.max(30, Math.min(58, Math.floor(rowH * 0.42)));
  const rtl = ctx.rtl;
  return (
    <div data-sp-view="history" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 26 }}>
      <ActLabel bi={WORDS.history} lang={ctx.lang} />
      <div style={{ flex: '1 1 0', minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 64, alignContent: 'center' }}>
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <i aria-hidden style={{ position: 'absolute', [rtl ? 'right' : 'left']: yearSize * 2.6 + 18, top: rowH * 0.3, bottom: rowH * 0.3, width: 3, borderRadius: 2, background: 'var(--sp-line)' }} />
            {!ctx.still && (
              <div aria-hidden style={{ position: 'absolute', [rtl ? 'right' : 'left']: yearSize * 2.6 + 18, top: rowH * 0.3, bottom: rowH * 0.3, width: 3, overflow: 'hidden' }}>
                <i className="sp-shimmer" style={{ display: 'block', '--from': '0px', '--run': '0px', width: 3, height: '100%', background: 'linear-gradient(180deg, transparent, var(--sp-acc), transparent)', animationName: 'spRunDown' }} />
              </div>
            )}
            {rows.slice(c * per, c * per + per).map((r, i) => {
              const t = pick(r, ctx.lang);
              const th = textDir(t) === 'rtl';
              return (
                <div key={i} className="sp-in" style={{ '--d': `${250 + (c * per + i) * 130}ms`, display: 'flex', alignItems: 'center', gap: 0, height: rowH, minWidth: 0 }}>
                  <span className="sp-num" style={{ flex: 'none', width: yearSize * 2.6, fontSize: yearSize, fontWeight: 600, color: 'var(--sp-acc)', lineHeight: 1, textAlign: 'end' }}>{r.year}</span>
                  <i aria-hidden style={{ flex: 'none', width: 22, height: 22, borderRadius: '50%', margin: '0 7px', background: 'var(--bg)', boxShadow: 'inset 0 0 0 5px var(--sp-acc)' }} />
                  <div dir={th ? 'rtl' : 'ltr'} style={{ flex: '1 1 0', minWidth: 0, marginInlineStart: 22, fontFamily: th ? F.he : F.en, fontSize: th ? he(textSize) : textSize, fontWeight: 500, lineHeight: 1.28, color: 'var(--sp-ink)',
                    display: '-webkit-box', WebkitLineClamp: rowH > textSize * 2.9 ? 2 : 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VortAct({ sp, box, ctx }) {
  const v = sp.vort || {};
  const x = twoTexts(v, ctx.lang);
  const main = x.he && (ctx.lang !== 'english') && !x.en ? x.he : x.en || x.he;
  const mh = textDir(main) === 'rtl';
  const second = x.en && x.he ? (main === x.en ? x.he : '') : '';
  const p = ctx.portrait;
  return (
    <div data-sp-view="vort" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
      <ActLabel bi={WORDS.vort} lang={ctx.lang} />
      <div style={{ position: 'relative', display: 'flex', gap: 30, minHeight: 0 }}>
        <span aria-hidden className="sp-pop" style={{ '--d': '150ms', flex: 'none', fontFamily: F.enD, fontSize: p ? 150 : 190, lineHeight: 0.8, fontWeight: 800, color: 'var(--sp-acc)', marginTop: -6 }}>{mh ? '„' : '“'}</span>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="sp-in" style={{ '--d': '300ms', width: '100%' }}>
            <Fit text={main} max={p ? 54 : 60} min={28} maxH={box.h * (second ? 0.48 : 0.66)} lines={8} dir={dirOf(main)}
              style={{ fontFamily: mh ? F.th : F.te, fontWeight: 500, lineHeight: 1.36, color: 'var(--sp-ink)' }} />
          </div>
          {second && (
            <div className="sp-in" style={{ '--d': '500ms', width: '100%' }}>
              <Fit text={second} max={40} min={26} maxH={box.h * 0.22} lines={3} dir="rtl" style={{ fontFamily: F.th, fontWeight: 500, lineHeight: 1.4, color: 'var(--sp-dim)' }} />
            </div>
          )}
          <SourceLine text={v.source} />
        </div>
      </div>
    </div>
  );
}

function PhotoFrame({ src, dim = 0, still, w, h, radius = 28 }) {
  const id = useUid('ph');
  return (
    <div className="sp-fade" style={{ '--d': '100ms', position: 'relative', width: w, height: h, borderRadius: radius, overflow: 'hidden', flex: 'none', background: 'var(--sp-surface2)',
      boxShadow: '0 30px 60px -28px var(--shade), 0 0 0 2px var(--sp-line)' }}>
      <div className={still ? '' : 'sp-ken'} style={{ position: 'absolute', inset: 0, backgroundImage: `url("${String(src).replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `color-mix(in srgb, var(--bg) ${Math.round(Math.min(0.8, Math.max(0, dim)) * 100)}%, transparent)` }} />
      <svg aria-hidden width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10" style={{ position: 'absolute', inset: 0 }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset=".55" style={{ stopColor: 'var(--bg)', stopOpacity: 0 }} /><stop offset="1" style={{ stopColor: 'var(--bg)', stopOpacity: 0.55 }} /></linearGradient></defs>
        <rect width="10" height="10" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

export function PhotoAct({ sp, box, ctx }) {
  const p = ctx.portrait;
  const cap = pick(sp.happened, ctx.lang);
  const ch = textDir(cap) === 'rtl';
  const pw = p ? box.w : Math.round(box.w * 0.56);
  const ph = p ? Math.round(box.h * 0.62) : box.h;
  return (
    <div data-sp-view="photo" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row-reverse', gap: p ? 30 : 64, alignItems: 'stretch' }}>
      <PhotoFrame src={sp.photo?.src} dim={sp.photo?.dim} still={ctx.still} w={pw} h={ph} />
      <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <ActLabel bi={WORDS.happened} lang={ctx.lang} />
        {cap && (
          <div className="sp-in" style={{ '--d': '350ms', width: '100%' }}>
            <Fit text={cap} max={p ? 54 : 58} min={28} maxH={p ? box.h - ph - 110 : box.h * 0.66} lines={6} dir={dirOf(cap)}
              style={{ fontFamily: ch ? F.heD : F.enD, fontWeight: 600, lineHeight: 1.2, color: 'var(--sp-ink)' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function StoryAct({ sp, ctx, holdMs = 20000 }) {
  const x = twoTexts(sp.story, ctx.lang);
  return (
    <div data-sp-view="story" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 26, '--ink': 'var(--text)', '--line': 'var(--sp-line)' }}>
      <ActLabel bi={WORDS.story} lang={ctx.lang} />
      <StoryText en={x.en} he={x.he} cols={!ctx.portrait} max={ctx.portrait ? 46 : 44} min={28} holdMs={holdMs} className="sp-fade" />
      <SourceLine text={sp.story?.source} />
    </div>
  );
}

/** The DAY itself: 'Today is' + the name huge (+ the photo framed at the end edge), the whole day long. */
export function DayHero({ sp, box, ctx, nowMs = Date.now() }) {
  const p = ctx.portrait;
  const lang = ctx.lang;
  const n = sp.name || {};
  const bigHe = lang !== 'english' && !!n.he;
  const big = bigHe ? n.he : (n.en || n.he || '');
  const sub = lang === 'both' && bigHe ? n.en : '';
  const photo = sp.photo?.src;
  const pw = photo ? (p ? box.w : Math.round(box.w * 0.4)) : 0;
  const ph = photo ? (p ? Math.round(box.h * 0.38) : box.h) : 0;
  const line = pick(sp.happened, lang);
  const lh = textDir(line) === 'rtl';
  const live = nowMs >= (sp.startMs || 0);
  return (
    <div data-sp-view="day" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row-reverse', gap: p ? 34 : 70, alignItems: 'stretch' }}>
      {photo && <PhotoFrame src={photo} dim={sp.photo?.dim} still={ctx.still} w={pw} h={ph} radius={32} />}
      <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, alignItems: photo || !p ? 'stretch' : 'center' }}>
        <div className="sp-in" style={{ '--d': '60ms', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span aria-hidden style={{ position: 'relative', width: 22, height: 22, flex: 'none' }}>
            <i style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--sp-acc)' }} />
            {!ctx.still && <i className="sp-ripple" style={{ position: 'absolute', inset: -6, borderRadius: '50%', boxShadow: '0 0 0 3px var(--sp-acc)' }} />}
          </span>
          <Cap bi={live ? WORDS.happening : WORDS.todayIs} lang={lang} size={30} color="var(--sp-acc)" />
        </div>
        <div className="sp-pop" style={{ '--d': '200ms', width: '100%' }}>
          <Fit text={big} max={photo ? 150 : 200} min={56} maxH={box.h * (p ? 0.3 : 0.5)} lines={2} dir={dirOf(big)}
            style={{ fontFamily: bigHe ? F.heD : F.enD, fontWeight: 800, lineHeight: 1.04, color: 'var(--sp-ink)', letterSpacing: bigHe ? 0 : '-.02em' }} />
        </div>
        {sub && <div className="sp-in" style={{ '--d': '400ms', width: '100%' }}><Fit text={sub} max={56} min={28} style={{ fontFamily: F.enD, fontWeight: 600, color: 'var(--sp-dim)', lineHeight: 1.2 }} /></div>}
        {line && (
          <div className="sp-in" style={{ '--d': '600ms', width: '100%', marginTop: 10, paddingInlineStart: 24, borderInlineStart: '4px solid var(--sp-acc)' }}>
            <Fit text={line} max={38} min={26} maxH={box.h * 0.24} lines={3} dir={dirOf(line)} style={{ fontFamily: lh ? F.he : F.en, fontWeight: 500, lineHeight: 1.3, color: 'var(--sp-ink)' }} />
          </div>
        )}
        {sp.years?.tier && <div className="sp-in" style={{ '--d': '800ms', marginTop: 12 }}><SealBadge years={sp.years} lang={lang} size={120} /></div>}
      </div>
    </div>
  );
}

export const ACTS = { happened: HappenedAct, history: HistoryAct, vort: VortAct, photo: PhotoAct, story: StoryAct };
export const actHas = (sp, act) => ({
  happened: hasText(sp.happened), history: (sp.history || []).length > 0, vort: hasText(sp.vort), photo: !!sp.photo?.src, story: hasText(sp.story),
}[act]);
