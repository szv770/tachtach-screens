import React, { useLayoutEffect, useRef, useState } from 'react';
import { Panel, F, he as heSize, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { birthdaysFor, displayName } from '../../../shared/roster.js';
import { HERO_HE, HERO_EN, pickBlessing, tagFor, stripText, BROCHO_KICKER } from '../../../shared/birthdayCopy.js';

/**
 * Birthdays: the "hype" page for the bochurim whose HEBREW birthday it is (roster: src/shared/roster.js).
 *
 *   bunting                  a static garland across the top (drops in once)
 *   מזל טוב!                 the Hebrew hero, in the accent, huge (scales in with a little overshoot)
 *   HAPPY BIRTHDAY           the English line
 *   Today we celebrate       then the names pop in ONE BY ONE, as big as they fit
 *   Our brocho to you        a warm brocho, one a day (birthdayCopy.js), English + Hebrew
 *   Just celebrated | Coming up   a small strip: yesterday and the next 2 days
 *
 * A Shabbos birthday shows the Thursday before and the Sunday after (tagged). The page is only in the rotation
 * on days somebody has one (App.jsx); the admin preview can still ask for it, so there is a quiet empty state.
 *
 * Motion (owner, 2026-10-25: "it starts and freezes with confetti stuck mid-drop"): the entrance is a FINITE
 * sequence and every confetti piece falls all the way through the panel and out of the bottom (the fall distance
 * is the panel's measured layout height), so the page always settles into a clean still state, never pieces
 * hanging in mid-air. Two waves at the start; Lively adds one smaller wave ~7 s in. Each piece is one small
 * element with ONE animation (translate3d + rotate, opacity at the very end): no loops, filters, blur or shadows.
 * Minimal motion / prefers-reduced-motion: no falling confetti, everything simply shows (bunting stays).
 * Graphics Off: no confetti, no bunting; Subtle: fewer pieces.
 */

const rnd = (i, n) => { const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };

/** Deterministic confetti waves: { x %, delay ms, dur ms, sway/drift px, spins, size, kind, tone }. */
function wave(count, seed, start, spread) {
  return Array.from({ length: count }, (_, k) => {
    const i = seed * 100 + k;
    return {
      x: 2 + rnd(i, 1) * 96,
      delay: Math.round(start + rnd(i, 2) * spread),
      dur: Math.round(2600 + rnd(i, 3) * 1400),
      sway: Math.round((rnd(i, 4) - 0.5) * 160),
      drift: Math.round((rnd(i, 5) - 0.5) * 220),
      r0: Math.round(rnd(i, 6) * 360),
      spin: Math.round((rnd(i, 7) > 0.5 ? 1 : -1) * (360 + rnd(i, 8) * 540)),
      flip: Math.round(360 + rnd(i, 9) * 720),
      size: 14 + Math.round(rnd(i, 10) * 20),
      kind: k % 3, tone: k % 5,
    };
  });
}
const WAVES = {
  rich: [wave(22, 1, 0, 500), wave(14, 2, 650, 600)],
  subtle: [wave(12, 1, 0, 500), wave(8, 2, 650, 600)],
  lively: wave(12, 3, 7000, 700),
};
const TONES = [
  'var(--accent)',
  'color-mix(in srgb, var(--accent) 60%, var(--ink))',
  'color-mix(in srgb, var(--accent) 55%, var(--panel))',
  'color-mix(in srgb, var(--ink) 45%, var(--panel))',
  'color-mix(in srgb, var(--accent) 80%, var(--panel))',
];

/** Falling confetti over the whole panel. Every piece ends below the bottom edge (opacity 0), so nothing is left mid-screen. */
function Confetti({ graphics, motion }) {
  const ref = useRef(null);
  const [fall, setFall] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight; // layout px (ScreenScaler's transform does not touch it)
    if (h) setFall(h + 90);
  }, []);
  if (graphics === 'off' || motion === 'minimal') return null;
  const pieces = [...WAVES[graphics === 'subtle' ? 'subtle' : 'rich'].flat(), ...(motion === 'lively' && graphics !== 'subtle' ? WAVES.lively : [])];
  return (
    <div ref={ref} aria-hidden data-bd-confetti="" style={{ position: 'absolute', inset: 0, zIndex: 2, overflow: 'hidden', pointerEvents: 'none', borderRadius: 32, '--fall': `${fall}px` }}>
      {fall > 0 && pieces.map((p, i) => (
        <span key={i} className="tt-bd-f" style={{
          left: `${p.x}%`, '--d': `${p.delay}ms`, '--dur': `${p.dur}ms`, '--sx': `${p.sway}px`, '--dx': `${p.drift}px`,
          '--r0': `${p.r0}deg`, '--r1': `${p.r0 + p.spin}deg`, '--fx': `${p.flip}deg`,
          width: p.kind === 1 ? p.size * 0.45 : p.size, height: p.kind === 1 ? p.size * 1.2 : p.size * 0.5,
          borderRadius: p.kind === 2 ? '50%' : 3, background: TONES[p.tone],
        }} />
      ))}
    </div>
  );
}

/** A static garland of little flags across the top of the panel (drops in once on Smooth / Lively). */
function Bunting({ portrait }) {
  const count = portrait ? 11 : 17;
  const W = count * 100, H = 74, sag = 26;
  const y = (x) => 8 + sag * 4 * (x / W) * (1 - x / W);
  const flags = Array.from({ length: count }, (_, i) => {
    const x0 = i * 100 + 12, x1 = i * 100 + 88, xm = (x0 + x1) / 2;
    return { d: `M${x0} ${y(x0)} L${x1} ${y(x1)} L${xm} ${y(xm) + 40} Z`, tone: i % 3 };
  });
  const fills = ['var(--accent)', 'color-mix(in srgb, var(--accent) 50%, var(--panel))', 'color-mix(in srgb, var(--ink) 30%, var(--panel))'];
  return (
    <svg className="tt-bd-bunt" aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', zIndex: 1, top: 0, left: 0, width: '100%', height: portrait ? 64 : 70, pointerEvents: 'none' }}>
      <path d={`M0 ${y(0)} Q${W / 2} ${8 + sag * 2} ${W} ${y(W)}`} fill="none" stroke="var(--line)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      {flags.map((f, i) => <path key={i} d={f.d} fill={fills[f.tone]} />)}
    </svg>
  );
}

function Cake({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flex: 'none' }}>
      <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 56h44" />
        <rect x="14" y="40" width="36" height="16" rx="3" />
        <rect x="19" y="26" width="26" height="14" rx="3" />
        <path d="M14 47c4 3 8 3 12 0s8-3 12 0 8 3 12 0" />
        <path d="M32 26V16M25 26v-8M39 26v-8" />
      </g>
      <g fill="currentColor"><path d="M32 6c3 3 3 6 0 8-3-2-3-5 0-8z" /><path d="M25 10c2 2 2 4 0 6-2-2-2-4 0-6zM39 10c2 2 2 4 0 6-2-2-2-4 0-6z" /></g>
    </svg>
  );
}

const fontFor = (text, h, e) => (textDir(text) === 'rtl' ? h : e);

export default function BirthdaysSlide({ roster, dateISO, portrait: portraitProp }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const names = roster?.birthdays?.names === 'short' ? 'short' : 'full';
  const { today, recent, upcoming } = birthdaysFor(roster?.people || [], dateISO, roster?.birthdays);
  const n = today.length;

  if (!n) {
    return (
      <Panel pad="38px 60px">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, color: 'var(--inkDim)', fontFamily: F.en, fontSize: 34 }}>
          <Cake size={72} /> No birthdays today
        </div>
      </Panel>
    );
  }

  const blessing = pickBlessing(dateISO);
  const cols = n > 8 ? 3 : n > 3 ? 2 : 1;
  // the more names, the more of the page they get (the Hebrew hero gives way first)
  const heroGrow = n > 3 ? 0.55 : n > 1 ? 0.85 : 1;
  const namesGrow = n > 3 ? 2.5 : n > 1 ? 2 : 1.7;
  const key = `${dateISO}|${n}|${portrait}`;
  const strips = [
    { title: 'Just celebrated', text: stripText(recent, names) },
    { title: 'Coming up', text: stripText(upcoming, names) },
  ].filter((s) => s.text);

  const bunting = design.graphics !== 'off';
  const padTop = bunting ? (portrait ? 84 : 76) : (portrait ? 44 : 34);

  return (
    <Panel pad={portrait ? `${padTop}px 44px 40px` : `${padTop}px 56px 34px`} style={{ '--n': Math.min(n, 12) }}>
      {bunting && <Bunting portrait={portrait} />}
      <Confetti key={`c|${key}`} graphics={design.graphics} motion={design.motion} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Fit key={`h|${key}`} className="tt-bd-hero" max={portrait ? 230 : 210} min={60} dir="rtl" style={{
          ...(portrait ? { flex: 'none', height: n > 3 ? 190 : 270 } : { flex: `${heroGrow} 1 0`, minHeight: 0 }), width: '100%', textAlign: 'center', lineHeight: 1.25,
          fontFamily: F.heD, fontWeight: 800, color: 'var(--accentText)', paddingTop: 4,
        }}>
          {HERO_HE}
        </Fit>

        <div className="tt-bd-up" style={{ '--t': '650ms', flex: 'none', display: 'flex', alignItems: 'center', gap: 22, color: 'var(--accentText)', maxWidth: '100%' }}>
          <Cake size={portrait ? 56 : 62} />
          <Fit key={`e|${key}`} max={portrait ? 58 : 66} min={26} style={{ fontFamily: F.enD, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink)', height: portrait ? 78 : 86, display: 'flex', alignItems: 'center' }} dir="ltr">
            {HERO_EN}
          </Fit>
          <Cake size={portrait ? 56 : 62} />
        </div>
        <div className="tt-bd-up" style={{ '--t': '850ms', flex: 'none', marginTop: 6, display: 'flex', alignItems: 'center', gap: 16, fontFamily: F.en, fontSize: 24, fontWeight: 700, color: 'var(--inkDim)', letterSpacing: '.16em', textTransform: 'uppercase' }}>
          <span aria-hidden style={{ width: 48, height: 2, background: 'var(--line)' }} />
          {n > 1 ? `Today we celebrate ${n} birthdays` : 'Today we celebrate'}
          <span aria-hidden style={{ width: 48, height: 2, background: 'var(--line)' }} />
        </div>

        <Fit key={`n|${key}`} vcenter wrap max={portrait ? 190 : 170} min={30} dir="ltr" style={{
          flex: `${namesGrow} 1 0`, minHeight: 0, width: '100%', textAlign: 'center', lineHeight: 1.12, margin: '8px 0 12px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: '.9em', rowGap: '.12em', justifyItems: 'center', alignItems: 'start' }}>
            {today.map((t, i) => {
              const name = displayName(t.person, names);
              const tag = tagFor(t.kind);
              return (
                <div key={t.person.id} className="tt-bd-n" style={{ '--i': Math.min(i, 12), minWidth: 0, maxWidth: '100%' }}>
                  <div dir={textDir(name)} style={{ fontFamily: fontFor(name, F.heD, F.enD), fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)', overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>
                    {bidiNodes(name)}
                  </div>
                  {t.person.he && (
                    <div dir="rtl" style={{ fontFamily: F.he, fontSize: '.42em', fontWeight: 500, color: 'var(--inkDim)', lineHeight: 1.2 }}>{t.person.he}</div>
                  )}
                  {tag && (
                    <div style={{ display: 'inline-block', marginTop: '.1em', padding: '.08em .6em .1em', borderRadius: 999, border: '2px solid var(--line)', fontFamily: F.en, fontSize: 'max(20px, .2em)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--inkDim)', lineHeight: 1.2 }}>{tag}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Fit>

        <div className="tt-bd-up tt-bd-late" style={{
          flex: 'none', textAlign: 'center', maxWidth: portrait ? '100%' : '86%', marginTop: 6,
          padding: portrait ? '18px 28px 20px' : '16px 44px 18px', borderRadius: 24,
          background: 'color-mix(in srgb, var(--accentText) 10%, var(--panel))', border: '2px solid color-mix(in srgb, var(--accentText) 30%, transparent)',
        }}>
          <div style={{ fontFamily: F.en, fontSize: 19, fontWeight: 750, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accentText)', marginBottom: 6 }}>{BROCHO_KICKER(n)}</div>
          <div style={{ fontFamily: F.en, fontSize: portrait ? 32 : 34, fontWeight: 650, color: 'var(--ink)', lineHeight: 1.25, textWrap: 'balance' }}>{blessing.en}</div>
          <div dir="rtl" style={{ fontFamily: F.he, fontSize: heSize(portrait ? 28 : 30), fontWeight: 500, color: 'var(--inkDim)', lineHeight: 1.3, marginTop: 6, textWrap: 'balance' }}>{blessing.he}</div>
        </div>

        {strips.length > 0 && (
          <div className="tt-bd-up tt-bd-late" style={{
            '--t2': '300ms', flex: 'none', width: '100%', marginTop: 18, paddingTop: 14, borderTop: '2px solid var(--line)',
            display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 8 : 40, justifyContent: 'center',
          }}>
            {strips.map((s) => (
              <div key={s.title} style={{ flex: portrait ? 'none' : '1 1 0', minWidth: 0, display: 'flex', gap: 14, alignItems: 'baseline', justifyContent: portrait ? 'center' : 'flex-start', fontFamily: F.en, fontSize: 24, lineHeight: 1.3 }}>
                <span style={{ flex: 'none', fontSize: 18, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--inkDim)' }}>{s.title}</span>
                <span className="tt-clamp3" style={{ minWidth: 0, WebkitLineClamp: 2, color: 'var(--ink)', fontWeight: 550, textAlign: portrait ? 'center' : 'left' }}>{bidiNodes(s.text)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
