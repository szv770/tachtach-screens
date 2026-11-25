/**
 * Real-TV controls: pause / resume / next / previous / blank (screen commands) and Freeze (blank, logo, freeze, message with a
 * length of time). Both go through the screen's own routes, which need `screen.control` and keep the emergency rule: an
 * emergency takeover still shows through a freeze. Neither is part of Undo; resume_screen / resume are the way back.
 */
import { apiOk, ToolError, result, tzOf } from './common.js';
import { SCREEN_COMMAND_DONE } from '../../../shared/screenCommands.js';
import { untilFor, MODE_LABEL } from '../../../shared/freeze.js';

const WORDS = {
  pause: 'Pause the TV on the slide it is showing',
  resume: 'Let the TV play again',
  advance: 'Move the TV to the next slide',
  previous: 'Move the TV to the previous slide',
  blank: 'Toggle the TV black (blank) on or off',
};

const clockText = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

async function planCommand(ctx, { action }) {
  const st = await apiOk(ctx, 'GET', '/api/screen/status');
  const out = { ok: true, errors: [], warnings: [], sentence: `${WORDS[action]}.` };
  if (!st.online) out.warnings.push('The TV is not connected right now, so nothing will visibly change until it is.');
  if (action === 'blank') out.warnings.push('"blank" is a toggle: if the screen is already black this turns it back on. For a timed blank use freeze_screen.');
  return out;
}

export const screenControl = {
  plan: planCommand,
  async apply(ctx, args) {
    const plan = await planCommand(ctx, args);
    await apiOk(ctx, 'POST', `/api/screen/${args.action}`);
    return result({ done: true, what: SCREEN_COMMAND_DONE[args.action] || plan.sentence, undo: 'Not part of Undo. Use screen_control again (resume / previous) to go back.' });
  },
};

function freezeRequest(a) {
  const dur = { '30m': '30m', '1h': '1h', minutes: 'minutes', at: 'at', tomorrow: 'tomorrow', until_removed: 'manual' }[a.for || 'until_removed'];
  return { mode: a.mode, ...(a.mode === 'message' ? { message: a.message } : {}), ...(a.style ? { style: a.style } : {}), duration: dur, ...(dur === 'minutes' ? { minutes: a.minutes } : {}), ...(dur === 'at' ? { at: a.at } : {}) };
}

async function planFreeze(ctx, a) {
  const out = { ok: false, errors: [], warnings: [], sentence: '' };
  if (a.mode === 'message' && !String(a.message || '').trim()) { out.errors.push('For mode "message" give the text to show.'); return out; }
  if (a.for === 'minutes' && !a.minutes) { out.errors.push('"for: minutes" needs the number of minutes.'); return out; }
  if (a.for === 'at' && !a.at) { out.errors.push('"for: at" needs a clock time like 07:15.'); return out; }
  const [snap, settings] = await Promise.all([apiOk(ctx, 'GET', '/api/freeze'), apiOk(ctx, 'GET', '/api/settings')]);
  const tz = snap.tz || tzOf(settings); // the SCHOOL's clock, never the server's
  const req = freezeRequest(a);
  const until = untilFor(req, ctx.now().getTime(), tz, { netzMinutes: snap.netzMinutes });
  if (until === undefined) { out.errors.push('That time or length is not valid. Use a time like 07:15, or 1 to 10080 minutes.'); return out; }
  out.ok = true;
  out.request = req;
  const what = { blank: 'Turn the TV BLACK', logo: 'Show only the LOGO on the TV', freeze: 'FREEZE the TV on what it is showing', message: `Show the notice “${String(a.message).trim().slice(0, 120)}” on the TV` }[a.mode];
  out.sentence = `${what} ${until ? `until ${clockText(until, tz)}` : 'until someone resumes it'}.`;
  out.warnings.push('Emergency takeovers still show through a freeze. Everyone in the room sees this straight away. Use resume_screen to end it.');
  if (snap.manual) out.warnings.push(`It replaces the ${MODE_LABEL[snap.manual.mode] || 'current'} that is already on.`);
  return out;
}

export const freezeScreen = {
  plan: planFreeze,
  async apply(ctx, args) {
    const plan = await planFreeze(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    await apiOk(ctx, 'POST', '/api/freeze', plan.request);
    return result({ done: true, what: plan.sentence, undo: 'Not part of Undo. Use resume_screen to end it.' });
  },
};

async function planResume(ctx) {
  const snap = await apiOk(ctx, 'GET', '/api/freeze');
  const on = !!(snap.manual || snap.active);
  return { ok: true, errors: [], warnings: on ? [] : ['Nothing looks frozen or blanked right now; this changes nothing.'], sentence: on ? 'End the blank / freeze: the TV goes back to the slides.' : 'Make sure the TV is showing the slides again.' };
}

export const resumeScreen = {
  plan: planResume,
  async apply(ctx, args) {
    const plan = await planResume(ctx, args);
    await apiOk(ctx, 'DELETE', '/api/freeze');
    return result({ done: true, what: plan.sentence });
  },
};
