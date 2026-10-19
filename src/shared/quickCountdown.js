/**
 * Countdown line of the Quick time layout: "starts in 2 h 14 m" (an hour or more away),
 * "starts in 47:12" (live mm:ss under an hour). Pure; the stage ticks it once a second.
 * Returns '' once the time has passed (the line then simply empties).
 */

/** [t, ap] from splitTime ('1:45', 'PM') -> minutes since midnight, or null when not a real clock time. */
export function minutesFromSplit(parts) {
  if (!parts) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(parts[0] || ''));
  if (!m) return null;
  let h = +m[1];
  const ap = parts[1];
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h < 24 && +m[2] < 60 ? h * 60 + +m[2] : null;
}

/** @param {number} targetMins minutes since local midnight  @param {Date} now  @param {boolean} he */
export function countdownText(targetMins, now = new Date(), he = false) {
  if (!Number.isFinite(targetMins)) return '';
  const secs = Math.round(targetMins * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()));
  if (secs <= 0) return '';
  const lead = he ? 'מתחיל בעוד' : 'starts in';
  if (secs >= 3600) {
    const totalMin = Math.ceil(secs / 60);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return he ? `${lead} ${h} שע׳${m ? ` ${m} דק׳` : ''}` : `${lead} ${h} h${m ? ` ${m} m` : ''}`;
  }
  return `${lead} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
