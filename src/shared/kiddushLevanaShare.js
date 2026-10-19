/**
 * "Share with the rabbi": the upcoming Kiddush Levana months as plain text and as one clean
 * printable HTML page, with the rules the computer used and the questions to confirm.
 * Pure (admin, tests); rows come from kiddushLevanaTable().
 */
import { whenEn, moladEn, dayEn, timeEn, normalizeKlSettings } from './kiddushLevana.js';

/** What the rabbi is asked to confirm (same list as docs/kiddush-levana-next-14-months.md). */
export const KL_QUESTIONS = [
  'Is the halfway point of the month (molad + 14 days 18 hours 22 minutes) the right Chabad cutoff?',
  'Are the delaying customs right (wait until after Tisha B’Av; wait until after Yom Kippur)?',
  'When the 7th day lands in the small hours (for example 3:22 AM), is the first night to say it that evening?',
];

/** The rules in force, as plain sentences. */
export function klRules(settings) {
  const s = normalizeKlSettings(settings);
  const out = [
    `Opens ${s.startAfterDays} days after the molad, at the later of that moment and nightfall (tzeis, 7.083°).`,
    s.endRule === 'fifteen'
      ? 'Ends 15 days after the molad. The last night to say it is the night before that moment if it falls in the daytime.'
      : 'Ends at the halfway point of the month: molad + 14 days 18 hours 22 minutes (about 1⅔ seconds). The last night to say it is the night before that moment if it falls in the daytime.',
    'Only at night: from nightfall until the cutoff or dawn, whichever comes first.',
  ];
  out.push(s.skipCustoms
    ? 'Skipped nights: before Tisha B’Av (1–9 Av) and from Rosh Hashana through Yom Kippur. Between Yom Kippur and Sukkos it is only noted.'
    : 'No customs are skipped (Tisha B’Av and Rosh Hashana–Yom Kippur nights are allowed).');
  out.push('Molad times are shown on the school’s clock (the molad itself is in Jerusalem mean time).');
  return out;
}

/** One month as display strings. */
export function klRowText(row, tz) {
  const edits = [];
  if (row.overridden) {
    if (row.start !== row.computedStart) edits.push('start changed by hand');
    if (row.end !== row.computedEnd) edits.push('cutoff changed by hand');
  }
  const customs = (row.notes || []).map((n) => `${n.date}: ${n.en}${n.skipped ? ' (skipped)' : ''}`);
  return {
    month: row.month || '',
    hidden: !!row.hidden,
    molad: moladEn(row.molad, tz),
    canStart: whenEn(row.canStart, tz),
    cutoff: whenEn(row.end, tz),
    lastNight: row.last ? `${dayEn(row.last.start, tz)} (until ${row.last.end === row.end ? timeEn(row.end, tz) : 'dawn'})` : 'none',
    edits,
    customs,
  };
}

/** Plain-text version (copy / .txt download). */
export function klShareText({ rows = [], tz, settings, place = '', generatedAt = new Date() } = {}) {
  const L = [];
  L.push('Kiddush Levana — upcoming months');
  if (place) L.push(place);
  L.push(`Prepared ${new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium' }).format(generatedAt)}`);
  L.push('', 'RULES USED (please confirm)');
  klRules(settings).forEach((r) => L.push(`- ${r}`));
  L.push('', 'MONTHS');
  rows.forEach((row, i) => {
    const t = klRowText(row, tz);
    L.push('', `${i + 1}. ${t.month}${t.hidden ? '  [SKIPPED — not announced on the screen]' : ''}`);
    L.push(`   Molad:      ${t.molad}`);
    L.push(`   Can start:  ${t.canStart}`);
    L.push(`   Cutoff:     ${t.cutoff}`);
    L.push(`   Last night: ${t.lastNight}`);
    if (t.edits.length) L.push(`   Note:       ${t.edits.join('; ')}`);
    t.customs.forEach((c) => L.push(`   Custom:     ${c}`));
  });
  L.push('', 'QUESTIONS FOR THE RABBI');
  KL_QUESTIONS.forEach((q, i) => L.push(`${i + 1}. ${q}`));
  return `${L.join('\n')}\n`;
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** One self-contained printable page (no scripts, print CSS inside). */
export function klShareHtml({ rows = [], tz, settings, place = '', generatedAt = new Date() } = {}) {
  const prepared = new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium' }).format(generatedAt);
  const body = rows.map((row) => {
    const t = klRowText(row, tz);
    return `<tr${t.hidden ? ' class="off"' : ''}><td class="m">${esc(t.month)}${t.hidden ? '<br><span class="tag">skipped</span>' : ''}</td>`
      + `<td>${esc(t.molad)}</td><td>${esc(t.canStart)}</td><td>${esc(t.cutoff)}</td><td>${esc(t.lastNight)}`
      + `${t.edits.length ? `<br><span class="tag">${esc(t.edits.join('; '))}</span>` : ''}`
      + `${t.customs.map((c) => `<br><span class="note">${esc(c)}</span>`).join('')}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>Kiddush Levana - upcoming months</title><style>
:root{color-scheme:light}
body{font:15px/1.5 Georgia,'Times New Roman',serif;color:#1c1a17;background:#fff;margin:0;padding:24px;max-width:960px}
h1{font-size:26px;margin:0 0 2px}h2{font-size:16px;margin:26px 0 6px;letter-spacing:.06em;text-transform:uppercase;color:#6b5b3a}
.sub{color:#6b6458;margin:0 0 6px}ul,ol{margin:6px 0 0;padding-left:22px}li{margin:3px 0}
table{border-collapse:collapse;width:100%;margin-top:6px;font-size:14px}
th,td{border-bottom:1px solid #d9d2c3;padding:7px 8px;text-align:left;vertical-align:top}
th{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#6b5b3a;border-bottom:2px solid #b8a068}
td.m{font-weight:700;white-space:nowrap}tr.off td{color:#8a8478;text-decoration:line-through}tr.off td.m{text-decoration:none}
.tag{display:inline-block;font-size:11px;font-weight:700;color:#8a5a00;border:1px solid #c9a24a;border-radius:99px;padding:0 7px}
.note{font-size:12px;color:#6b6458}
@media (max-width:640px){body{padding:14px}table,thead,tbody,tr,th,td{display:block}thead{display:none}tr{border-bottom:1px solid #d9d2c3;padding:8px 0}td{border:0;padding:2px 0}}
@media print{body{padding:0}tr{break-inside:avoid}}
</style></head><body>
<h1>Kiddush Levana &mdash; upcoming months</h1>
<p class="sub">${esc(place)}${place ? ' &middot; ' : ''}Prepared ${esc(prepared)}</p>
<h2>Rules used (please confirm)</h2><ul>${klRules(settings).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<h2>Months</h2>
<table><thead><tr><th>Month</th><th>Molad</th><th>Can start</th><th>Cutoff</th><th>Last night</th></tr></thead><tbody>${body}</tbody></table>
<h2>Questions for the rabbi</h2><ol>${KL_QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
</body></html>`;
}
