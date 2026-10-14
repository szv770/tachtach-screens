import React from 'react';
import { Panel, TimeText, F, he } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { has, isHebrew } from '../../design/time.js';
import { layoutOf, to12h } from '../../../shared/announcements.js';

/**
 * Announcement renderers — ONE component per LAYOUT, painting only with the
 * panel roles (--panel --ink --inkDim --fill --fillInk --accentText
 * --f-disp-he/en --disp-w …) defined by <Panel look=…>. Styles live in
 * src/screen/design/announceStyles.js (the seam: a new takeover/announcement
 * style is a new entry there; a new layout is a new component here).
 *
 * Layouts (look.layout): bigwords · event · list · quicktime · classic.
 * `classic` (migrated pre-announcements items) renders as Big words with an
 * optional body/attribution line (R2 README "text templates fold in as
 * presets"). R2 §6 Announcements has the specs.
 */

const dispHe = { fontFamily: F.heD, fontWeight: 'var(--disp-w)', direction: 'rtl' };
const dispEn = { fontFamily: F.enD, fontWeight: 'var(--disp-w)', letterSpacing: '-.03em' };

// ── Big words ───────────────────────────────────────────────────────────────

export function BigWords({ item, scale = 1 }) {
  const c = item.content || {};
  const cap = item.look?.maxFontPx || null;
  const hePrim = has(c.headlineHe) ? c.headlineHe : (!has(c.headlineEn) && has(c.bodyHe) ? c.bodyHe : '');
  const enPrim = has(c.headlineEn) ? c.headlineEn : (!has(c.headlineHe) && !hePrim && has(c.bodyEn) ? c.bodyEn : '');
  // remaining body lines (when a headline exists)
  const bodyHe = has(c.headlineHe) || has(c.headlineEn) ? (has(c.bodyHe) ? c.bodyHe : '') : '';
  const bodyEn = has(c.headlineHe) || has(c.headlineEn) ? (has(c.bodyEn) ? c.bodyEn : '') : '';
  const only = !!hePrim !== !!enPrim; // exactly one headline language
  const hMax = Math.round((cap || 330) * scale);
  const foot = [c.subtitle, has(c.attribution) ? `— ${c.attribution}` : ''].filter(has).join('\n');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 0, textAlign: 'center', gap: 16 * scale }}>
      {has(c.target) && <div data-s="" style={{ '--i': 0, fontFamily: F.en, fontSize: 30 * scale, color: 'var(--inkDim)', fontWeight: 500, flex: 'none' }}>{c.target}</div>}
      {hePrim && (
        <Fit data-s="" wrap max={hMax} dir="rtl" style={{ '--i': 1, ...dispHe, width: '100%', flex: only ? 3 : 2.2, minHeight: 0, textAlign: 'center', color: 'var(--accentText)' }}>{hePrim}</Fit>
      )}
      {enPrim && (
        <Fit data-s="" wrap max={Math.round((hePrim ? 76 : cap || 200) * scale)} dir="ltr" style={{ '--i': 2, ...(hePrim ? { fontFamily: F.en, fontWeight: 600, letterSpacing: '-.02em' } : { ...dispEn, color: 'var(--ink)' }), width: hePrim ? '88%' : '100%', flex: hePrim ? 1.1 : 3, minHeight: 0, textAlign: 'center', lineHeight: 1.18 }}>{enPrim}</Fit>
      )}
      {(bodyHe || bodyEn) && (
        <div data-s="" style={{ '--i': 3, flex: 'none', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 10 * scale }}>
          {bodyHe && <div className="tt-he" style={{ fontFamily: F.he, fontSize: he(Math.round(40 * scale)), lineHeight: 1.4, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{bodyHe}</div>}
          {bodyEn && <div style={{ fontFamily: F.en, fontSize: 32 * scale, lineHeight: 1.4, color: bodyHe ? 'var(--inkDim)' : 'var(--ink)', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{bodyEn}</div>}
        </div>
      )}
      {foot && <div data-s="" style={{ '--i': 4, flex: 'none', fontFamily: F.en, fontSize: 30 * scale, color: 'var(--inkDim)', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{foot}</div>}
    </div>
  );
}

// ── Event card ──────────────────────────────────────────────────────────────

function TimeFace({ hhmm, size }) {
  const t = to12h(hhmm);
  const m = /^(\d{1,2}:\d{2})\s*(AM|PM)$/.exec(t);
  return (
    <span className="tt-num" style={{ fontSize: size, fontWeight: 'var(--tile-w, 700)', letterSpacing: '-.05em', lineHeight: 0.9, whiteSpace: 'nowrap' }}>
      {m ? m[1] : t}
      {m && <small style={{ fontSize: size * 0.28, letterSpacing: 0, fontWeight: 600, marginLeft: 10, opacity: 0.78 }}>{m[2]}</small>}
    </span>
  );
}

export function EventCard({ item, scale = 1 }) {
  const e = item.content?.event || {};
  const titleHe = has(e.titleHe) ? e.titleHe : '';
  const titleEn = has(e.title) ? e.title : '';
  const dayIsHe = isHebrew(e.day);
  const hasTile = has(e.day) || has(e.time);
  const hasPlace = has(e.place) || has(e.placeHe);
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateRows: hasTile || hasPlace ? '1fr auto' : '1fr', minHeight: 0, rowGap: 24 * scale }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, gap: 8, minWidth: 0 }}>
        {titleHe && <Fit data-s="" max={Math.round(210 * scale)} dir="rtl" style={{ '--i': 1, ...dispHe, height: titleEn ? '54%' : '88%', textAlign: 'left' }}>{titleHe}</Fit>}
        {titleEn && <Fit data-s="" max={Math.round((titleHe ? 180 : 230) * scale)} wrap={!titleHe} style={{ '--i': 2, ...dispEn, height: titleHe ? '42%' : '88%' }}>{titleEn}</Fit>}
      </div>
      {(hasTile || hasPlace) && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 48 * scale, flexWrap: 'nowrap' }}>
          {hasTile && (
            <div data-s="" style={{ '--i': 3, background: 'var(--fill)', color: 'var(--fillInk)', borderRadius: 30, padding: `${26 * scale}px ${44 * scale}px ${30 * scale}px`, display: 'flex', alignItems: 'center', gap: 40 * scale, boxShadow: 'var(--tileRing, none)', flex: 'none' }}>
              {has(e.day) && (
                <div style={{ fontFamily: dayIsHe ? F.he : F.en, fontSize: dayIsHe ? he(40 * scale) : 40 * scale, fontWeight: 600, lineHeight: 1.15, whiteSpace: 'pre-wrap', textAlign: 'left' }} dir={dayIsHe ? 'rtl' : 'ltr'}>{e.day}</div>
              )}
              {has(e.time) && <TimeFace hhmm={e.time} size={150 * scale} />}
            </div>
          )}
          {hasPlace && (
            <div data-s="" style={{ '--i': 4, paddingBottom: 8, minWidth: 0 }}>
              {has(e.place) && <div style={{ fontFamily: F.en, fontSize: 42 * scale, fontWeight: 600, lineHeight: 1.15 }}>{e.place}</div>}
              {has(e.placeHe) && <div className="tt-he" style={{ fontFamily: F.he, fontSize: he(34 * scale), color: 'var(--inkDim)', textAlign: 'left', marginTop: 6 }}>{e.placeHe}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── List ────────────────────────────────────────────────────────────────────

export function ListCard({ item, scale = 1 }) {
  const l = item.content?.list || {};
  const items = (l.items || []).filter(has).slice(0, 8);
  const heading = has(l.heading) ? l.heading : '';
  const headingHe = has(l.headingHe) ? l.headingHe : '';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {(heading || headingHe) && (
        <div data-s="" style={{ '--i': 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 * scale, gap: 24, flex: 'none' }}>
          <span style={{ ...dispEn, fontSize: 66 * scale, lineHeight: 1.1 }}>{heading}</span>
          <span className="tt-he" style={{ ...dispHe, fontSize: he(56 * scale), lineHeight: 1.1 }}>{headingHe}</span>
        </div>
      )}
      <div style={{ flex: 1, display: 'grid', gridAutoRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        {items.map((t, i) => {
          const hb = isHebrew(t);
          return (
            <div key={i} data-s="" style={{ '--i': i + 1, display: 'flex', alignItems: 'center', gap: 24, borderTop: '2px solid var(--line)', minHeight: 0 }}>
              <i style={{ width: 14, height: 14, borderRadius: '50%', background: i === 0 ? 'var(--accentText)' : 'var(--line)', flex: 'none' }} />
              <span dir={hb ? 'rtl' : 'ltr'} style={{ fontFamily: hb ? F.he : F.en, fontSize: hb ? he(44 * scale) : 42 * scale, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'pre-wrap', unicodeBidi: 'plaintext', textAlign: 'start' }}>{t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Quick time ──────────────────────────────────────────────────────────────

export function QuickTime({ item, scale = 1 }) {
  const q = item.content?.quicktime || {};
  const t = to12h(q.time);
  const m = /^(\d{1,2}:\d{2})\s*(AM|PM)$/.exec(t);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0 }}>
      <div data-s="" style={{ '--i': 0, display: 'flex', alignItems: 'baseline', gap: 36 * scale, maxWidth: '100%' }}>
        {has(q.name) && <span style={{ ...dispEn, fontSize: 80 * scale, lineHeight: 1.1 }}>{q.name}</span>}
        {has(q.nameHe) && <span className="tt-he" style={{ ...dispHe, fontSize: he(88 * scale), lineHeight: 1.1 }}>{q.nameHe}</span>}
      </div>
      <div data-s="" className="tt-num" style={{ '--i': 1, fontSize: 340 * scale, fontWeight: 'var(--qt-w, 300)', letterSpacing: '-.06em', lineHeight: 0.95, color: 'var(--accentText)', margin: `${6 * scale}px 0 ${16 * scale}px`, whiteSpace: 'nowrap' }}>
        {m ? m[1] : t}
        {m && <small style={{ fontSize: 72 * scale, fontWeight: 500, letterSpacing: 0, marginLeft: 16 }}>{m[2]}</small>}
      </div>
      {has(q.place) && <div data-s="" style={{ '--i': 2, fontFamily: isHebrew(q.place) ? F.he : F.en, fontSize: 38 * scale, color: 'var(--inkDim)', fontWeight: 500 }}>{q.place}</div>}
    </div>
  );
}

const LAYOUT_COMPONENTS = { bigwords: BigWords, event: EventCard, list: ListCard, quicktime: QuickTime, classic: BigWords };

/**
 * Rotation / hold slide body for an announcement item. Layout and style are
 * independent: the layout decides what is drawn, look.style how it is dressed.
 */
export default function AnnouncementSlide({ item }) {
  if (!item) return null;
  const C = LAYOUT_COMPONENTS[layoutOf(item)] || BigWords;
  return (
    <Panel look={item.look?.style || null} pad="48px 60px 52px">
      <C item={item} />
    </Panel>
  );
}

/**
 * Full-canvas takeover: same layouts and styles at 1520×820, rail hidden, a
 * small 34 px clock stays top-right. Pauses rotation (App.jsx).
 */
export function AnnouncementTakeover({ item, clock }) {
  if (!item) return null;
  const C = LAYOUT_COMPONENTS[layoutOf(item)] || BigWords;
  return (
    <div className="tt-fadein" style={{ position: 'absolute', inset: 0, zIndex: 100, padding: 40, display: 'flex', background: 'var(--bg)' }}>
      <Panel look={item.look?.style || null} pad="56px 72px 56px">
        {clock && (
          <span className="tt-num" style={{ position: 'absolute', top: 30, right: 48, fontSize: 34, fontWeight: 600, color: 'var(--inkDim)', zIndex: 3 }}>
            {clock.formatted} {clock.ampm}
          </span>
        )}
        <C item={item} scale={1.1} />
      </Panel>
    </div>
  );
}
