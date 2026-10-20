import React from 'react';
import { Panel, F, he as heSize, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { birthdaysFor, displayName } from '../../../shared/roster.js';
import { HERO_HE, HERO_EN, pickBlessing, tagFor, stripText } from '../../../shared/birthdayCopy.js';

/**
 * Birthdays: the "hype" page for the bochurim whose HEBREW birthday it is (roster: src/shared/roster.js).
 *
 *   מזל טוב!                 the Hebrew hero, in the accent, huge
 *   HAPPY BIRTHDAY           the English line
 *   Moshe Cohen              the names, as big as they fit (1 name = giant, many = columns)
 *   a blessing               one a day, English + Hebrew
 *   Just celebrated | Coming up   a small strip: yesterday and the next 2 days
 *
 * A Shabbos birthday shows the Thursday before and the Sunday after (tagged). The page itself is only in the
 * rotation on days somebody has one (App.jsx), so there is no empty state to design for; the admin preview can
 * still ask for it, so there is a quiet one. Confetti is static pieces in role colours (no images, no blur);
 * on Smooth / Lively it drops in once and each name pops once, on Minimal it stays still.
 */

// Deterministic confetti: fixed pseudo-random pieces in the top band (around the hero) and thin side margins,
// so a re-render never moves them and none lands on the names or the strip.
const PIECES = Array.from({ length: 34 }, (_, i) => {
  const r = (n) => { const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const top = i < 24;
  return {
    x: top ? 3 + r(1) * 94 : (i % 2 ? 1 + r(1) * 2.5 : 96.5 + r(1) * 2.5),
    y: top ? 3 + r(2) * 19 : 8 + r(2) * 80,
    rot: Math.round(r(3) * 360), size: 10 + Math.round(r(4) * 18), kind: i % 3, tone: i % 5, delay: Math.round(r(5) * 500),
  };
});
const TONES = [
  'var(--accent)',
  'color-mix(in srgb, var(--accent) 60%, var(--ink))',
  'color-mix(in srgb, var(--accent) 45%, transparent)',
  'color-mix(in srgb, var(--ink) 40%, transparent)',
  'color-mix(in srgb, var(--accent) 80%, var(--panel))',
];

function Confetti({ graphics }) {
  const n = graphics === 'off' ? 0 : graphics === 'subtle' ? 14 : PIECES.length;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 32 }}>
      {PIECES.slice(0, n).map((p, i) => (
        <span key={i} className="tt-bd-c" style={{
          position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, '--d': `${p.delay}ms`,
          width: p.kind === 1 ? p.size * 0.5 : p.size, height: p.kind === 1 ? p.size * 1.3 : p.size * 0.55,
          borderRadius: p.kind === 2 ? '50%' : 3, background: TONES[p.tone], transform: `rotate(${p.rot}deg)`, opacity: 0.85,
        }} />
      ))}
    </div>
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

  return (
    <Panel pad={portrait ? '44px 44px 40px' : '34px 56px 34px'}>
      <Confetti graphics={design.graphics} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Fit key={`h|${key}`} data-s="" max={portrait ? 230 : 210} min={60} dir="rtl" style={{
          '--i': 0, ...(portrait ? { flex: 'none', height: n > 3 ? 190 : 270 } : { flex: `${heroGrow} 1 0`, minHeight: 0 }), width: '100%', textAlign: 'center', lineHeight: 1.25,
          fontFamily: F.heD, fontWeight: 800, color: 'var(--accentText)', paddingTop: 4,
        }}>
          {HERO_HE}
        </Fit>

        <div data-s="" style={{ '--i': 1, flex: 'none', display: 'flex', alignItems: 'center', gap: 22, color: 'var(--accentText)', maxWidth: '100%' }}>
          <Cake size={portrait ? 56 : 62} />
          <Fit key={`e|${key}`} max={portrait ? 58 : 66} min={26} style={{ fontFamily: F.enD, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink)', height: portrait ? 78 : 86, display: 'flex', alignItems: 'center' }} dir="ltr">
            {HERO_EN}
          </Fit>
          <Cake size={portrait ? 56 : 62} />
        </div>
        {n > 1 && (
          <div data-s="" style={{ '--i': 1, flex: 'none', marginTop: 4, fontFamily: F.en, fontSize: 26, fontWeight: 500, color: 'var(--inkDim)', letterSpacing: '.02em' }}>
            {n} birthdays today
          </div>
        )}

        <Fit key={`n|${key}`} vcenter wrap max={portrait ? 190 : 170} min={30} dir="ltr" style={{
          flex: `${namesGrow} 1 0`, minHeight: 0, width: '100%', textAlign: 'center', lineHeight: 1.12, margin: '8px 0 12px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: '.9em', rowGap: '.12em', justifyItems: 'center', alignItems: 'start' }}>
            {today.map((t, i) => {
              const name = displayName(t.person, names);
              const tag = tagFor(t.kind);
              return (
                <div key={t.person.id} className="tt-bd-n" style={{ '--i': i, minWidth: 0, maxWidth: '100%' }}>
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

        <div data-s="" style={{ '--i': 3, flex: 'none', textAlign: 'center', maxWidth: '100%', marginTop: 6 }}>
          <div style={{ fontFamily: F.en, fontSize: portrait ? 30 : 32, fontWeight: 650, color: 'var(--ink)', lineHeight: 1.25, textWrap: 'balance' }}>{blessing.en}</div>
          <div dir="rtl" style={{ fontFamily: F.he, fontSize: heSize(portrait ? 26 : 28), fontWeight: 500, color: 'var(--inkDim)', lineHeight: 1.3, marginTop: 4 }}>{blessing.he}</div>
        </div>

        {strips.length > 0 && (
          <div data-s="" style={{
            '--i': 4, flex: 'none', width: '100%', marginTop: 18, paddingTop: 14, borderTop: '2px solid var(--line)',
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
