import React from 'react';
import { Panel, F, bidiNodes } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { textDir } from '../../../shared/bidi.js';
import { pickDailyWord, splitEmphasis } from '../../../shared/dailyWords.js';

/**
 * Daily Word: one Yiddish (or other) word per day, "one subject per page".
 *
 *   header      "Word of the day · Sunday, October 18"           [YIDDISH]
 *   hero        the word in Hebrew letters, huge, Torah-text Hebrew role
 *               (Frank Ruhl Libre by default: clean nikud), auto-fit, with a
 *               generous line-height so patah/komets/dagesh never clip
 *   say-it      transliteration · pronunciation (stressed syllable in ink,
 *               heavy; the rest dim) · part-of-speech chip
 *   lower       Meaning + the optional origin note | "In conversation": the
 *               two convo lines as calm alternating bubbles; the *word* in
 *               the accent (the page's one accent moment)
 *
 * Landscape puts meaning and conversation side by side under the hero;
 * portrait stacks everything. Every block auto-fits (design/fit.jsx), so a
 * 12-letter word, a two-word phrase, a 220-character meaning, no context or
 * no conversation all fill the panel without clipping. The word is a pure
 * function of the date (src/shared/dailyWords.js): every screen shows the
 * same one. Static faint letter behind the hero (graphics setting), no loops.
 */

const HE_LETTER = /[א-תװ-ײ]/;
const LANG_LABEL = { yiddish: 'Yiddish', hebrew: 'Hebrew', aramaic: 'Aramaic', ladino: 'Ladino' };

function dateLabel(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** "far-BREN-gen" → [{t:'far'}, {t:'-', sep}, {t:'BREN', stress}, …]. A syllable in CAPS is stressed. */
export function pronunciationParts(p) {
  return String(p || '').split(/([\s\-·]+)/).filter(Boolean).map((t) => {
    if (/^[\s\-·]+$/.test(t)) return { t, sep: true };
    return { t, stress: /[A-Z]/.test(t) && !/[a-z]/.test(t) };
  });
}

const fontFor = (text, he, en) => (textDir(text) === 'rtl' ? he : en);

/** Glue the last two words (no lone last word on a wrapped line). */
const glue = (t) => (String(t || '').trim().split(/\s+/).length >= 4 ? String(t).trim().replace(/\s+(\S+)$/, '\u00a0$1') : String(t || ''));

const label = {
  fontFamily: F.en, fontSize: 21, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
  color: 'var(--inkDim)', lineHeight: 1.2, flex: 'none',
};

/** One convo line as a quiet bubble; *word* in the accent. */
function Bubble({ text, side, i, tinted }) {
  const dir = textDir(text);
  text = glue(text);
  const right = side === 'right';
  return (
    <div data-s="" style={{ '--i': i, display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start' }}>
      <div dir={dir} style={{
        maxWidth: '88%', padding: '.5em .85em .55em', lineHeight: 1.32, unicodeBidi: 'isolate',
        borderRadius: right ? '1em 1em .28em 1em' : '1em 1em 1em .28em',
        background: tinted ? 'color-mix(in srgb, var(--accentText) 13%, var(--panel))' : 'var(--hi)',
        fontFamily: dir === 'rtl' ? F.he : F.en, fontWeight: 500, color: 'var(--ink)',
        textAlign: dir === 'rtl' ? 'right' : 'left', textWrap: 'pretty',
      }}>
        {splitEmphasis(text).map((p, k) => (p.em
          ? <b key={k} style={{ color: 'var(--accentText)', fontWeight: 750 }}>{bidiNodes(p.text)}</b>
          : <span key={k}>{bidiNodes(p.text)}</span>))}
      </div>
    </div>
  );
}

export default function DailyWordSlide({ dailyWords, dateISO, portrait: portraitProp }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const w = pickDailyWord(dailyWords, dateISO);
  if (!w) return null;

  const hero = w.word || w.transliteration;
  const heroHe = textDir(hero) === 'rtl';
  const translit = w.word ? w.transliteration : '';
  const pron = pronunciationParts(w.pronunciation);
  const convo = (w.convo || []).map((l) => l?.text).filter(Boolean);
  const context = w.context || '';
  const lang = LANG_LABEL[String(w.language || '').toLowerCase()] || w.language || '';
  const date = dateLabel(dateISO);
  const letter = heroHe ? (hero.match(HE_LETTER) || [])[0] : '';
  const art = design.graphics !== 'off' && letter;
  const key = `${w.id}|${portrait}`;

  // Room for the lower blocks grows with how much they have to say, so a
  // short entry gives the hero more height and a wordy one takes it back.
  const lowerChars = (w.meaning || '').length + context.length * 0.7 + convo.join(' ').length * (portrait ? 1 : 0.5);
  const lowerGrow = portrait ? 1.1 + Math.min(1.2, lowerChars / 300) : 0.8 + Math.min(1.1, lowerChars / 300);

  const sayIt = (translit || pron.length || w.partOfSpeech) ? (
    <Fit key={`s|${key}`} data-s="" max={portrait ? 50 : 54} min={22} dir="ltr" style={{ '--i': 2, flex: 'none', width: '100%', height: portrait ? 76 : 78, textAlign: 'center', lineHeight: 1.3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {translit && <span style={{ fontFamily: F.enD, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--ink)' }}>{translit}</span>}
      {translit && pron.length > 0 && <span aria-hidden style={{ display: 'inline-block', width: '.16em', height: '.16em', borderRadius: '50%', background: 'var(--line)', margin: '0 .5em', verticalAlign: 'middle' }} />}
      {pron.length > 0 && (
        <span style={{ fontFamily: F.en, fontSize: '.78em', letterSpacing: '.02em' }}>
          {pron.map((p, k) => (p.sep
            ? <span key={k} style={{ color: 'var(--past)', fontWeight: 400 }}>{p.t.trim() ? ' · ' : ' '}</span>
            : <span key={k} style={p.stress ? { color: 'var(--ink)', fontWeight: 800 } : { color: 'var(--inkDim)', fontWeight: 500 }}>{p.t}</span>))}
        </span>
      )}
      {w.partOfSpeech && (
        <span style={{ display: 'inline-block', marginLeft: '.7em', padding: '.24em .7em .26em', borderRadius: 999, border: '2px solid var(--line)', fontFamily: F.en, fontSize: 'max(20px, .4em)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--inkDim)', verticalAlign: 'middle', lineHeight: 1.1 }}>
          {w.partOfSpeech}
        </span>
      )}
    </Fit>
  ) : null;

  // The block labels sit inside each Fit (fixed px, they never scale), so a
  // label always stays with its text: top-aligned columns in landscape,
  // centred groups in portrait.
  const blockLabel = (text) => <div style={{ ...label, marginBottom: 14, textAlign: portrait ? 'center' : 'left' }}>{text}</div>;
  const align = portrait ? 'center' : 'flex-start';

  const meaningBlock = (
    <Fit key={`m|${key}`} data-s="" vcenter wrap max={portrait ? 46 : 42} min={20} dir="ltr" style={{
      '--i': 3, flex: 1, minHeight: 0, minWidth: 0, width: '100%', alignItems: align,
      textAlign: portrait ? 'center' : 'left', lineHeight: 1.3,
    }}>
        {blockLabel('Meaning')}
        <div dir={textDir(w.meaning)} style={{ fontFamily: fontFor(w.meaning, F.he, F.en), fontWeight: 500, color: 'var(--ink)', textWrap: 'balance', unicodeBidi: 'isolate', textAlign: 'inherit' }}>
          {bidiNodes(glue(w.meaning))}
        </div>
        {context && (
          <div style={{ display: 'flex', gap: '.5em', alignItems: 'baseline', justifyContent: portrait ? 'center' : 'flex-start', marginTop: '.9em', fontSize: 'max(20px, .62em)', lineHeight: 1.4, color: 'var(--inkDim)' }}>
            <span aria-hidden style={{ flex: 'none', width: '1.4em', height: 2, background: 'var(--line)', transform: 'translateY(-.3em)', display: portrait ? 'none' : 'block' }} />
            <div dir={textDir(context)} style={{
              fontFamily: fontFor(context, F.th, F.te), fontStyle: textDir(context) === 'rtl' ? 'normal' : 'italic', fontWeight: 450,
              textWrap: 'pretty', unicodeBidi: 'isolate', minWidth: 0,
              // an over-long note (admin limit 320) never pushes the meaning out
              display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: portrait ? 4 : 5, overflow: 'hidden',
            }}>
              {bidiNodes(glue(context))}
            </div>
          </div>
        )}
    </Fit>
  );

  const convoBlock = convo.length > 0 && (
    <Fit key={`c|${key}`} vcenter wrap max={portrait ? 38 : 34} min={20} dir="ltr" style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%', alignItems: align, lineHeight: 1.32 }}>
      <div data-s="" style={{ '--i': 4 }}>{blockLabel('In conversation')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.45em', paddingBottom: 6 /* Fit tolerates 2px of overflow; keep it inside the bubble gap, not the bubble */ }}>
        {convo.map((t, k) => <Bubble key={k} text={t} i={5 + k} side={k % 2 ? 'right' : 'left'} tinted={k === convo.length - 1 && convo.length > 1} />)}
      </div>
    </Fit>
  );

  return (
    <Panel pad={portrait ? '40px 48px 44px' : '38px 60px 44px'}>
      {art && (
        <div aria-hidden className="tt-he" style={{
          position: 'absolute', zIndex: 0, pointerEvents: 'none', userSelect: 'none',
          top: portrait ? '-3%' : '6%', right: portrait ? '-7%' : '-5%',
          fontFamily: F.th, fontWeight: 600, lineHeight: 1,
          fontSize: portrait ? 640 : 620,
          color: `color-mix(in srgb, var(--ink) ${(design.light ? 3 : 4) * (design.graphics === 'subtle' ? 0.6 : 1)}%, transparent)`,
        }}>{letter}</div>
      )}

      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <header data-s="" style={{ '--i': 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <span style={{ fontFamily: F.en, fontSize: 26, fontWeight: 500, color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 650 }}>Word of the day</span>
            {date && <span>{'  ·  '}{date}</span>}
          </span>
          {lang && (
            <span style={{ ...label, flex: 'none', padding: '7px 16px 6px', borderRadius: 999, border: '2px solid var(--line)' }}>{lang}</span>
          )}
        </header>

        <Fit key={`h|${key}`} data-s="" vcenter wrap={hero.length > 18} max={portrait ? 300 : 280} min={56} dir={heroHe ? 'rtl' : 'ltr'} style={{
          '--i': 1, flex: `${portrait ? 1.25 : 1.3} 1 0`, minHeight: 0, width: '100%', textAlign: 'center',
          // Nikud sits below the baseline and the dots/holam above: a roomy
          // line box (and a little padding) keeps every mark inside the clip.
          lineHeight: heroHe ? 1.42 : 1.18,
          fontFamily: heroHe ? F.th : F.enD, fontWeight: heroHe ? 600 : 700,
          letterSpacing: heroHe ? 0 : '-.02em', color: 'var(--ink)',
        }}>
          {hero}
        </Fit>

        {sayIt}

        <div data-s="" style={{ '--i': 3, flex: 'none', height: 2, background: 'var(--line)', borderRadius: 1, margin: portrait ? '22px 8% 26px' : '18px 0 24px' }} />

        <div style={{
          flex: `${lowerGrow} 1 0`, minHeight: 0, display: 'flex',
          flexDirection: portrait ? 'column' : 'row', gap: portrait ? 34 : 64,
        }}>
          {meaningBlock}
          {convoBlock}
        </div>
      </div>
    </Panel>
  );
}
