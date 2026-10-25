import React, { useEffect } from 'react';
import { Panel, F, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { pickDailyStory } from '../../../shared/dailyStories.js';

/**
 * Daily Story: a short story or thought to read, one a day (src/shared/dailyStories.js; the list is edited in
 * admin Screen > Daily Story). "One subject per page", readable from across the room:
 *
 *   header      "Story of the day · Sunday, October 25"                 [STORY | THOUGHT]
 *   title       English display role, auto-fit; Hebrew title under it
 *   rule        the page's one accent
 *   text        auto-fit on a reading measure (~60 characters a line); English + optional Hebrew
 *               (landscape: side by side; portrait: stacked)
 *   source      small, dim, Torah-text role
 *
 * The pick is a pure function of the date, so every screen shows the same story. Static faint book graphic
 * (graphics setting), no loops. A long story asks the rotation for a little more time (reading speed ~140 wpm,
 * never less than the slide's own seconds).
 */

function dateLabel(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Seconds a passer-by needs to read it: words at ~140 wpm (Hebrew a little slower) + a few seconds to look up. */
export function readingSeconds(story) {
  const words = (t, wpm) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length * (60 / wpm) : 0);
  return Math.round(Math.min(90, 4 + words(story?.text, 140) + words(story?.textHe, 110) * 0.5));
}

const label = {
  fontFamily: F.en, fontSize: 21, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
  color: 'var(--inkDim)', lineHeight: 1.2, flex: 'none',
};

function Book({ size }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 100 72" aria-hidden style={{ display: 'block' }}>
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M50 14C40 7 24 5 6 8v54c18-3 34-1 44 6 10-7 26-9 44-6V8C76 5 60 7 50 14z" />
        <path d="M50 14v54" />
        <path d="M14 20c10-1 20 0 28 4M14 30c10-1 20 0 28 4M14 40c10-1 20 0 28 4M58 24c8-4 18-5 28-4M58 34c8-4 18-5 28-4M58 44c8-4 18-5 28-4" />
      </g>
    </svg>
  );
}

function TextBlock({ text, id, i, portrait, max }) {
  const rtl = textDir(text) === 'rtl';
  return (
    <Fit key={`${id}|${text.length}|${portrait}`} data-s="" vcenter wrap max={max} min={22} dir={rtl ? 'rtl' : 'ltr'} style={{
      '--i': i, flex: '1 1 0', minHeight: 0, minWidth: 0, width: '100%',
      textAlign: rtl ? 'right' : 'left', lineHeight: rtl ? 1.5 : 1.42,
      fontFamily: rtl ? F.he : F.en, fontWeight: 500, color: 'var(--ink)',
    }}>
      <div style={{ maxWidth: '32em', margin: '0 auto', textWrap: 'pretty', whiteSpace: 'pre-line' }}>{bidiNodes(text)}</div>
    </Fit>
  );
}

export default function DailyStorySlide({ dailyStories, dateISO, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const s = pickDailyStory(dailyStories, dateISO);
  const want = s ? readingSeconds(s) : 0;
  const base = Number(slide?.duration) || 0;
  useEffect(() => { if (want && onRequestDuration && want > (base || 25)) onRequestDuration(want); }, [s?.id, want]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;

  const isThought = s.kind === 'thought';
  const date = dateLabel(dateISO);
  const title = s.title || s.titleHe || '';
  const titleHe = s.title ? s.titleHe : '';
  const both = !!(s.text && s.textHe);
  const key = `${s.id}|${portrait}`;
  const art = design.graphics !== 'off';
  const long = (s.text || '').length + (s.textHe || '').length;

  return (
    <Panel pad={portrait ? '40px 52px 40px' : '38px 72px 38px'}>
      {art && (
        <div aria-hidden style={{
          position: 'absolute', zIndex: 0, pointerEvents: 'none', right: portrait ? 32 : 44, bottom: portrait ? 28 : 30,
          color: `color-mix(in srgb, var(--ink) ${(design.light ? 6 : 8) * (design.graphics === 'subtle' ? 0.6 : 1)}%, transparent)`,
        }}><Book size={portrait ? 220 : 240} /></div>
      )}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <header data-s="" style={{ '--i': 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <span style={{ fontFamily: F.en, fontSize: 26, fontWeight: 500, color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 650 }}>{isThought ? 'Thought for today' : 'Story of the day'}</span>
            {date && <span>{'  ·  '}{date}</span>}
          </span>
          <span style={{ ...label, padding: '7px 16px 6px', borderRadius: 999, border: '2px solid var(--line)' }}>{isThought ? 'Thought' : 'Story'}</span>
        </header>

        {title && (
          <Fit key={`t|${key}`} data-s="" wrap={title.length > 28} max={portrait ? 92 : 96} min={36} dir={textDir(title)} style={{
            '--i': 1, flex: 'none', width: '100%', height: portrait ? 200 : (title.length > 28 ? 190 : 120), marginTop: portrait ? 26 : 20,
            textAlign: 'center', lineHeight: 1.15, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: textDir(title) === 'rtl' ? F.heD : F.enD, fontWeight: 750, letterSpacing: textDir(title) === 'rtl' ? 0 : '-.015em', color: 'var(--ink)',
          }}>
            {title}
          </Fit>
        )}
        {titleHe && (
          <div data-s="" dir="rtl" className="tt-he" style={{ '--i': 2, flex: 'none', textAlign: 'center', fontFamily: F.heD, fontWeight: 600, fontSize: `calc(${portrait ? 40 : 42}px * var(--he-scale, 1))`, color: 'var(--inkDim)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {titleHe}
          </div>
        )}
        <div data-s="" style={{ '--i': 2, flex: 'none', width: 72, height: 4, borderRadius: 2, background: 'var(--accentText)', margin: portrait ? '24px auto 22px' : '18px auto 18px' }} />

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait || !both ? 'column' : 'row', gap: portrait ? 28 : 64 }}>
          {s.text && <TextBlock text={s.text} id={`e|${key}`} i={3} portrait={portrait} max={both ? (portrait ? 48 : 46) : (long < 260 ? 72 : 60)} />}
          {s.textHe && <TextBlock text={s.textHe} id={`h|${key}`} i={4} portrait={portrait} max={both ? (portrait ? 50 : 48) : 72} />}
        </div>

        {s.source && (
          <div data-s="" style={{ '--i': 5, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: portrait ? 22 : 16, paddingRight: art ? (portrait ? 160 : 180) : 0, paddingLeft: art ? (portrait ? 160 : 180) : 0 }}>
            <span aria-hidden style={{ width: 36, height: 2, background: 'var(--line)', flex: 'none' }} />
            <span dir={textDir(s.source)} style={{ fontFamily: textDir(s.source) === 'rtl' ? F.th : F.te, fontStyle: textDir(s.source) === 'rtl' ? 'normal' : 'italic', fontSize: 28, color: 'var(--inkDim)', lineHeight: 1.3, textAlign: 'center', minWidth: 0 }}>{bidiNodes(s.source)}</span>
            <span aria-hidden style={{ width: 36, height: 2, background: 'var(--line)', flex: 'none' }} />
          </div>
        )}
      </div>
    </Panel>
  );
}
