import React from 'react';
import Clock from './Clock.jsx';
import PinnedNotes from './PinnedNotes.jsx';
import { CreditContent, creditShown, creditSpot } from './Credit.jsx';
import { F, he, Bidi } from '../design/ui.jsx';
import { useDesign } from '../design/DesignRoot.jsx';
import { WeatherIcon, ShabbosMark, Ornament, ProgressRing } from '../design/graphics.jsx';
import { describeWeather } from '../../shared/weatherCodes.js';
import { plainHebrew, fmt12 } from '../design/time.js';
import { hNum } from '../../shared/constants.js';

/**
 * The always-on rail (R2 README §5): clock · Hebrew date · English date ·
 * parsha · weather (anchored to the bottom). Only when relevant: the up-next
 * card (a schedule item starts within settings.rail.upNextMinutes) and side
 * notes. Never in the rail: next zman, schedule lists, slide index, location.
 * Busy rail (card and/or notes): the date block tightens and the parsha goes
 * to one line so everything fits without scrolling.
 */

const SEFIROS = ['חסד', 'גבורה', 'תפארת', 'נצח', 'הוד', 'יסוד', 'מלכות'];
function sefira(count) {
  if (!count || count < 1 || count > 49) return '';
  return `${SEFIROS[(count - 1) % 7]} שב${SEFIROS[Math.floor((count - 1) / 7)]}`;
}

const MONTH_ALIASES = { Iyyar: 'Iyar', Iyar: 'Iyyar', Tevet: 'Teves', Teves: 'Tevet', Heshvan: 'Cheshvan', Cheshvan: 'Heshvan' };
export function todaysCustomDays(customDays, hebrewDate, now = new Date()) {
  if (!customDays?.length) return [];
  const gm = now.getMonth() + 1, gd = now.getDate();
  return customDays.filter((d) => {
    if (d.hebrewMonth && hebrewDate) {
      return (d.hebrewMonth === hebrewDate.hebrewMonth || d.hebrewMonth === MONTH_ALIASES[hebrewDate.hebrewMonth]) && d.hebrewDay === hebrewDate.hebrewDay;
    }
    if (d.gregorianMonth) return d.gregorianMonth === gm && d.gregorianDay === gd;
    return false;
  });
}

/** "Parashat Noach" (Hebcal) → "Parshas Noach". */
export function parshaEnglish(name) {
  return String(name || '').replace(/^Parashat\s+/i, 'Parshas ').replace(/^Parshat\s+/i, 'Parshas ');
}

const YOM_TOV = /(Rosh Hashana|Yom Kippur|Sukkot|Shmini Atzeret|Simchat Torah|Pesach|Shavuot|Chanukah|Purim)/i;

/** Hebrew date with the ב prefix and niqqud removed. */
export function hebrewDateText(hebrewDate) {
  return plainHebrew(String(hebrewDate?.hebrew || '').replace(/\s+ב[֐-׏]*(?=[א-ת])/, ' '));
}

export function englishDateText(now = new Date()) {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function WeatherReadout({ weather, busy = false, compact = false, align = 'left', iconFill = 'var(--bg)' }) {
  if (!weather?.current) return null;
  const d = describeWeather(weather.current.code, weather.current.isDay !== false);
  const hi = weather.today?.hi, lo = weather.today?.lo;
  const small = busy || compact;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexDirection: align === 'right' ? 'row-reverse' : 'row', flex: 'none' }}>
      <WeatherIcon icon={d.icon} size={small ? 52 : 60} fill={iconFill} />
      <span className="tt-num" style={{ fontSize: small ? 52 : 62, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1 }}>{weather.current.temp}°</span>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 24, fontWeight: 500, lineHeight: 1.3, alignItems: align === 'right' ? 'flex-end' : 'flex-start', fontFamily: F.en, minWidth: 0 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{d.en}</span>
        {hi != null && lo != null && <span className="tt-num" style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>H {hi}° · L {lo}°</span>}
      </div>
    </div>
  );
}

export function UpNextCard({ item, align = 'left' }) {
  const { graphics } = useDesign();
  if (!item) return null;
  const nameHe = item.nameHe;
  const nameEn = item.name;
  const t = fmt12(item.startMins);
  const ring = graphics === 'rich';
  const R = 108;
  const eta = (
    <div className="tt-num" style={{ textAlign: 'center', lineHeight: 0.85, position: 'relative', width: ring ? R : 'auto', height: ring ? R : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {ring && <ProgressRing size={R} stroke={6} fraction={item.fraction} />}
      <b style={{ fontSize: ring ? 58 : 84, fontWeight: 700, letterSpacing: '-.045em', display: 'block' }}>{item.minsLeft}</b>
      <span style={{ fontSize: ring ? 20 : 22, fontWeight: 600, marginTop: ring ? 2 : 0 }}>min</span>
    </div>
  );
  return (
    <div style={{
      background: 'var(--accent)', color: 'var(--onAccent)', borderRadius: 24, width: '100%', marginBottom: 14,
      display: 'grid', gridTemplateColumns: align === 'right' ? 'auto 1fr' : '1fr auto', alignItems: 'center', columnGap: 12,
      padding: ring ? '14px 16px 14px 24px' : '20px 24px', flex: 'none',
    }}>
      {align === 'right' && eta}
      <div style={{ minWidth: 0, textAlign: align }}>
        {nameHe ? (
          <Bidi as="div" text={nameHe} fallback="rtl" style={{ fontFamily: F.heD, fontSize: he(38), fontWeight: 600, lineHeight: 1.15, textAlign: align }} />
        ) : (
          <Bidi as="div" text={nameEn} style={{ fontFamily: F.enD, fontSize: 36, fontWeight: 700, lineHeight: 1.15, textAlign: align }} />
        )}
        <div style={{ fontFamily: F.en, fontSize: 23, opacity: 0.8, marginTop: 2 }}>
          {nameHe && nameEn ? <><Bidi text={nameEn} />{' at '}</> : 'at '}<span className="tt-num">{t.t}</span>
        </div>
      </div>
      {align !== 'right' && eta}
    </div>
  );
}

/**
 * "Now in session: Night Seder · ends 9:45 AM" (attention stage 3). A quiet raised card with an
 * accent bar (the up-next card is the loud accent-filled one); static, no animation.
 */
export function SessionBadge({ item, align = 'left' }) {
  if (!item) return null;
  const end = fmt12(item.endMins);
  const nameHe = item.nameHe;
  const right = align === 'right';
  return (
    <div data-stage="session" style={{
      background: 'var(--raised)', borderRadius: 22, width: '100%', marginBottom: 14, flex: 'none', boxSizing: 'border-box',
      padding: '14px 22px 16px', textAlign: align,
      [right ? 'borderRight' : 'borderLeft']: '8px solid var(--accent)',
    }}>
      <div style={{ fontFamily: F.en, fontSize: 19, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>Now in session</div>
      {nameHe ? (
        <Bidi as="div" text={nameHe} fallback="rtl" style={{ fontFamily: F.heD, fontSize: he(36), fontWeight: 600, lineHeight: 1.15, marginTop: 4, textAlign: align }} />
      ) : (
        <Bidi as="div" text={item.name} style={{ fontFamily: F.enD, fontSize: 34, fontWeight: 700, lineHeight: 1.15, marginTop: 4, textAlign: align }} />
      )}
      {nameHe && item.name && <Bidi as="div" text={item.name} style={{ fontFamily: F.en, fontSize: 22, color: 'var(--dim)', marginTop: 2, textAlign: align }} />}
      <div style={{ fontFamily: F.en, fontSize: 23, color: 'var(--dim)', marginTop: 6, fontWeight: 500 }}>
        {item.endKind === 'until' ? 'until' : 'ends'} <span className="tt-num" style={{ color: 'var(--text)', fontWeight: 600 }}>{end.t}</span> {end.ap}
      </div>
    </div>
  );
}

export default function Rail({
  clock, cache = {}, settings = {}, customDays, notes = [], upNext = null, session = null, weather, credit, portrait = false, side = 'left', now = new Date(),
}) {
  const { graphics } = useDesign();
  const vis = settings.visibility || {};
  const busy = !!upNext || !!session || notes.length > 0;
  const align = side === 'right' && !portrait ? 'right' : 'left';
  const hd = vis.hebrewDate !== false ? hebrewDateText(cache.hebrewDate) : '';
  const parsha = vis.parsha !== false && (cache.parsha?.hebrew || cache.parsha?.name) ? cache.parsha : null;
  const omer = vis.omer !== false && cache.omer?.count ? cache.omer.count : null;
  const specials = todaysCustomDays(customDays, cache.hebrewDate, now);
  const dow = now.getDay();
  const yomTov = (cache.hebrewDate?.events || []).find((e) => YOM_TOV.test(e));
  const mark = graphics !== 'off' && (dow === 5 || dow === 6 || yomTov);
  const showWeather = settings.weather?.enabled !== false && settings.weather?.showInRail !== false && weather?.current;
  const cSpot = creditShown(credit) ? creditSpot(credit) : null;
  // rail-center: the logo owns the rail's free middle; while the up-next card
  // or side notes need that room it steps down to a small rail foot.
  const creditMid = cSpot === 'rail-center' && !busy;
  const creditFoot = cSpot === 'under-clock' || (cSpot === 'rail-center' && busy);

  // Date unit (owner polish): Hebrew date strongest, English day/date beneath
  // on the same edge, then the parsha as a quiet chip that belongs to them.
  // One edge, one rhythm (8 / 20 px), sizes stepping 56 → 27 → 30/21.
  const edge = portrait || align === 'right' ? 'flex-end' : 'flex-start';
  const textEdge = portrait ? 'right' : align;
  const dates = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: edge, textAlign: textEdge, marginTop: portrait ? 2 : busy ? 26 : 38 }}>
      {hd && (
        <div className="tt-he" style={{ fontFamily: F.heD, fontSize: he(portrait ? 52 : busy ? 50 : 56), fontWeight: 600, lineHeight: 1.04, letterSpacing: '-.005em' }}>{hd}</div>
      )}
      <div style={{ fontFamily: F.en, fontSize: busy && !portrait ? 25 : 27, color: 'var(--dim)', fontWeight: 500, lineHeight: 1.2, marginTop: hd ? 8 : 0, letterSpacing: '.005em' }}>{englishDateText(now)}</div>
      {(omer || specials.length > 0) && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, alignItems: edge }}>
          {omer && (
            <div className="tt-he" style={{ fontFamily: F.he, fontSize: he(28), fontWeight: 600, color: 'var(--accent)' }}>
              {hNum(omer)} לעומר <span style={{ fontWeight: 500, color: 'var(--dim)' }}>· {sefira(omer)}</span>
            </div>
          )}
          {specials.map((d, i) => (
            <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
              {graphics !== 'off' && <Ornament size={18} style={{ color: 'var(--accent)' }} />}
              <Bidi text={d.title} style={{ fontFamily: /[א-ת]/.test(d.title) ? F.he : F.en, fontSize: /[א-ת]/.test(d.title) ? he(28) : 25, fontWeight: 600 }} />
              {d.subtitle && <Bidi text={d.subtitle} style={{ fontFamily: F.en, fontSize: 21, color: 'var(--dim)' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const markEl = mark ? (yomTov && dow !== 5 && dow !== 6
    ? <Ornament size={20} style={{ color: 'var(--dim)' }} />
    : <ShabbosMark size={busy ? 24 : 26} style={{ color: 'var(--dim)', marginBottom: -2 }} />) : null;
  const parshaEl = parsha ? (
    <div style={{ display: 'flex', justifyContent: edge, marginTop: portrait ? 0 : busy ? 14 : 20, maxWidth: '100%' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 2, maxWidth: '100%',
        justifyContent: edge, flexDirection: align === 'right' && !portrait ? 'row-reverse' : 'row',
        background: 'var(--raised)', borderRadius: 18, padding: busy && !portrait ? '7px 16px 8px' : '9px 18px 10px',
      }}>
        {markEl}
        {parsha.hebrew && <span className="tt-he" style={{ fontFamily: F.he, fontSize: he(busy && !portrait ? 28 : 31), fontWeight: 600, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{parsha.hebrew}</span>}
        {parsha.name && <span style={{ fontFamily: F.en, fontSize: busy && !portrait ? 20 : 21, color: 'var(--dim)', fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{parshaEnglish(parsha.name)}</span>}
      </div>
    </div>
  ) : null;

  const clockEl = vis.clock !== false && clock ? <Clock formatted={clock.formatted} ampm={clock.ampm} align={align} /> : null;
  const wx = showWeather ? <WeatherReadout weather={weather} busy={busy} compact={portrait} align={align} /> : null;
  const cards = (
    <>
      <SessionBadge item={session} align={align} />
      <UpNextCard item={upNext} align={align} />
      <PinnedNotes pinned={notes} visibility={vis} align={align} />
    </>
  );

  if (portrait) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 24, padding: '0 6px', alignItems: 'start' }}>
        <div style={{ gridColumn: 1, gridRow: 1 }}>{clockEl}</div>
        <div style={{ gridColumn: 2, gridRow: 1, textAlign: 'right' }}>{dates}</div>
        <div style={{ gridColumn: 1, gridRow: 2, marginTop: 28, alignSelf: 'center' }}>{wx}</div>
        <div style={{ gridColumn: 2, gridRow: 2, marginTop: 28, alignSelf: 'center' }}>{parshaEl}</div>
        {(upNext || session || notes.length > 0) && <div style={{ gridColumn: '1 / -1', marginTop: 22 }}>{cards}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'stretch', flex: 1, minHeight: 0, width: '100%', padding: '4px 0 2px' }}>
      {clockEl}
      {dates}
      {parshaEl}
      {creditMid ? (
        <div style={{ flex: 1, minHeight: 20, display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', padding: '24px 0' }}>
          <CreditContent credit={credit} spot="rail-center" align={align} maxWidth={400} />
        </div>
      ) : <div style={{ flex: 1, minHeight: 20 }} />}
      {cards}
      {wx}
      {creditFoot && (
        <div style={{ marginTop: busy ? 14 : 22, display: 'flex', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', flex: 'none' }}>
          <CreditContent credit={credit} spot={busy ? 'busy' : 'under-clock'} align={align} maxWidth={400} />
        </div>
      )}
    </div>
  );
}
