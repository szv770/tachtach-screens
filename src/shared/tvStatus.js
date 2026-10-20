/**
 * The plain-English line about the real TV: "TV is on: Zmanim, slide 4 of 11 · online" or, when it is
 * offline, "TV offline since 10:42 · probably on: Zmanim (estimate)". Pure; the admin passes the status
 * it polled, the clock and a way to name a slide.
 */
import { simulate } from './rotationPosition.js';

const clock = (ms, tz) => {
  try { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }); } catch { return ''; }
};

/**
 * status: the /api/screen/status body ({ online, lastSeenMs, reportedAtMs, slideId, slideIndex, paused, held,
 *   heldBy, startedAtMs, slides:[{id,ms}], serverNow, fetchedAt (browser ms when it was fetched) }) or null.
 * opts: { now, nameOf(id) -> string, currentIds (the admin's enabled slide ids), frozen (bool), tz }
 * Returns { tone: 'live'|'off'|'warn'|'unknown', headline, detail, estimated, slideId, index, total }.
 */
export function describeTv(status, { now = Date.now(), nameOf = (id) => String(id), currentIds, frozen = false, tz } = {}) {
  if (!status) return { tone: 'unknown', headline: 'Checking the TV…', detail: '', estimated: false, slideId: null, index: null, total: 0 };
  const list = Array.isArray(status.slides) ? status.slides : [];
  const total = list.length;
  const noReport = !status.reportedAtMs || !status.slideId;
  // The server's clock, not this browser's, decides how long ago things happened: serverNow was true
  // when the status was fetched (fetchedAt, this browser's clock), and time has passed since.
  const serverTime = Number.isFinite(status.serverNow) ? status.serverNow + (now - (Number.isFinite(status.fetchedAt) ? status.fetchedAt : now)) : now;
  const pausedBy = status.heldBy === 'freeze' || frozen ? 'The screen is frozen'
    : status.heldBy === 'takeover' ? 'A takeover is showing'
    : status.heldBy === 'hold' ? 'A message is holding the screen'
    : status.paused ? 'Paused' : null;
  const extras = [pausedBy, status.overlay === 'countdown' ? 'A countdown is showing' : null].filter(Boolean);

  if (status.online) {
    if (noReport) return { tone: 'live', headline: 'TV is on · online', detail: 'Waiting for it to say which slide it is on.', estimated: false, slideId: null, index: null, total };
    const idx = list.findIndex((s) => s.id === status.slideId);
    const pos = idx >= 0 ? `, slide ${idx + 1} of ${total}` : '';
    return { tone: pausedBy ? 'warn' : 'live', headline: `TV is on: ${nameOf(status.slideId)}${pos} · online`, detail: extras.join(' · '), estimated: false, slideId: status.slideId, index: idx >= 0 ? idx : null, total };
  }

  const since = status.lastSeenMs ? `offline since ${clock(status.lastSeenMs, tz)}` : 'offline';
  if (noReport) return { tone: 'off', headline: `TV ${since}`, detail: 'No report from it yet, so there is nothing to estimate.', estimated: false, slideId: null, index: null, total };
  const sim = simulate({
    list, slideId: status.slideId, startedAt: status.startedAtMs,
    paused: !!(status.paused || status.held || frozen),
  }, serverTime, { currentIds });
  if (!sim.known) {
    return { tone: 'off', headline: `TV ${since} · position unknown`, detail: sim.reason === 'changed' ? 'The slides changed since it last reported.' : 'Not enough to guess from.', estimated: false, slideId: null, index: null, total };
  }
  const why = sim.paused ? 'It was paused or showing a takeover when it went quiet, so it is probably still there.' : sim.stuck ? 'It was on a video with no timer.' : 'Takeovers and messages are not part of the guess.';
  return { tone: 'off', headline: `TV ${since} · probably on: ${nameOf(sim.slideId)} (estimate)`, detail: why, estimated: true, slideId: sim.slideId, index: sim.index, total };
}
