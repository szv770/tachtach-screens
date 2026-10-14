/** Time helpers shared by the redesigned pages (canvas only, no DOM). */

/** "7:18 AM" / "19:05" / "7:18PM" → minutes after midnight, else null. */
export function toMinutes(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (m12) {
    let h = Number(m12[1]) % 12;
    if (m12[3].toUpperCase() === 'P') h += 12;
    return h * 60 + Number(m12[2]);
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]), m = Number(m24[2]);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  return null;
}

/** minutes → { t: '7:18', ap: 'AM' } */
export function fmt12(mins) {
  const v = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60), mm = v % 60;
  return { t: `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`, ap: h < 12 ? 'AM' : 'PM' };
}

/** Whole minutes since midnight for a Date. */
export function nowMinutes(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** "16 min" / "1 hr 5 min" / "2 hr" */
export function durationText(mins) {
  const d = Math.max(0, Math.round(mins));
  if (d < 60) return `${d} min`;
  const h = Math.floor(d / 60), m = d % 60;
  return `${h} hr${m ? ` ${m} min` : ''}`;
}

const HEB_NIQQUD = /[֑-ׇ]/g;
/** Strip niqqud/cantillation (Hebcal month names carry it). */
export function plainHebrew(s) {
  return String(s || '').replace(HEB_NIQQUD, '');
}

export const isHebrew = (s) => /[א-ת]/.test(String(s || ''));
export const has = (s) => !!String(s ?? '').trim();
