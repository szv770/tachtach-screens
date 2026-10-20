import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gematriaDay, dayFromGematria, parseHebrewBirthday, parseEnglishDate, hebrewBirthdayFromISO, parseDelimited,
  parseRosterRows, normalizePerson, normalizePeople, isBirthdayOn, showDaysFor, birthdaysFor, birthdayLabel, shortName,
  normalizeSettings, forKiosk, hebrewDateOf,
} from '../src/shared/roster.js';

const P = (first, last, month, day) => ({ id: `id_${first}${day}`, first, last, month, day });

test('gematria days both ways', () => {
  assert.equal(gematriaDay(23), 'כ״ג');
  assert.equal(gematriaDay(15), 'ט״ו');
  assert.equal(gematriaDay(16), 'ט״ז');
  assert.equal(gematriaDay(30), 'ל׳');
  assert.equal(gematriaDay(1), 'א׳');
  for (let n = 1; n <= 30; n++) assert.equal(dayFromGematria(gematriaDay(n)), n, `day ${n}`);
  assert.equal(dayFromGematria('תשס'), null);
});

test('parseHebrewBirthday reads Hebrew, English and Yiddish spellings', () => {
  assert.deepEqual(parseHebrewBirthday('כ״ג אדר'), { month: 'Adar', day: 23 });
  assert.deepEqual(parseHebrewBirthday('23 Adar II'), { month: 'Adar II', day: 23 });
  assert.deepEqual(parseHebrewBirthday('Adar 1, 14'), { month: 'Adar I', day: 14 });
  assert.deepEqual(parseHebrewBirthday('י״א ניסן'), { month: 'Nisan', day: 11 });
  assert.deepEqual(parseHebrewBirthday('11 Nissan 5770'), { month: 'Nisan', day: 11 });
  assert.deepEqual(parseHebrewBirthday('3rd of Teves'), { month: 'Tevet', day: 3 });
  assert.deepEqual(parseHebrewBirthday('29 Cheshvan'), { month: 'Heshvan', day: 29 });
  assert.deepEqual(parseHebrewBirthday('ה׳ מנחם אב'), { month: 'Av', day: 5 });
  assert.deepEqual(parseHebrewBirthday('12 Tammuz'), { month: 'Tamuz', day: 12 });
  assert.equal(parseHebrewBirthday('30 Elul'), null); // Elul has 29 days
  assert.equal(parseHebrewBirthday('Moshe'), null);
  assert.equal(parseHebrewBirthday('3/14/2008'), null);
});

test('English dates convert to the Hebrew birthday', () => {
  assert.equal(parseEnglishDate('3/14/2008'), '2008-03-14');
  assert.equal(parseEnglishDate('14/3/2008'), '2008-03-14'); // impossible month -> day first
  assert.equal(parseEnglishDate('2008-03-14'), '2008-03-14');
  assert.equal(parseEnglishDate('March 14, 2008'), '2008-03-14');
  assert.equal(parseEnglishDate(new Date(Date.UTC(2008, 2, 14))), '2008-03-14');
  assert.equal(parseEnglishDate('hello'), null);
  assert.deepEqual(hebrewBirthdayFromISO('2008-03-14'), { month: 'Adar II', day: 7 }); // 5768 was a leap year
  assert.deepEqual(hebrewBirthdayFromISO('2026-10-20'), { month: 'Heshvan', day: 9 });
});

test('CSV / paste parsing', () => {
  assert.deepEqual(parseDelimited('a,b,c\n"x, y",2,3'), [['a', 'b', 'c'], ['x, y', '2', '3']]);
  assert.deepEqual(parseDelimited('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseDelimited('Moshe Cohen - 23 Adar\nDovid Levi - 5 Av'), [['Moshe Cohen', '23 Adar'], ['Dovid Levi', '5 Av']]);
});

test('parseRosterRows: first, last, Hebrew date, header, English fallback', () => {
  const out = parseRosterRows(parseDelimited('First,Last,Birthday\nMoshe,Cohen,כ״ג אדר\nDovid,Levi,5 Av\nYossi,Katz,3/14/2008\nBad,Row,nothing'));
  assert.deepEqual(out.people.map((p) => [p.first, p.last, p.month, p.day, p.from]), [
    ['Moshe', 'Cohen', 'Adar', 23, 'hebrew'], ['Dovid', 'Levi', 'Av', 5, 'hebrew'], ['Yossi', 'Katz', 'Adar II', 7, 'english'],
  ]);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].row, 5);
});

test('parseRosterRows: one full-name column, Excel Date cells, Hebrew beats English in the same row', () => {
  const out = parseRosterRows([
    ['Name', 'Hebrew birthday', 'DOB'],
    ['Moshe Cohen', '5 Av', new Date(Date.UTC(2008, 2, 14))],
    ['Levi, Dovid', new Date(Date.UTC(2008, 2, 14)), ''],
  ]);
  assert.deepEqual(out.people.map((p) => [p.first, p.last, p.month, p.day]), [['Moshe', 'Cohen', 'Av', 5], ['Dovid', 'Levi', 'Adar II', 7]]);
});

test('normalizePerson validates month/day and names', () => {
  assert.equal(normalizePerson({ first: 'A', month: 'Elul', day: 30 }).error, 'Elul has no day 30.');
  assert.ok(normalizePerson({ first: '', last: '', month: 'Av', day: 1 }).error);
  assert.ok(normalizePerson({ first: 'A', month: 'March', day: 1 }).error);
  const ok = normalizePerson({ first: ' Moshe ', last: 'C', month: 'Av', day: '5', he: ' משה ' });
  assert.equal(ok.first, 'Moshe'); assert.equal(ok.day, 5); assert.equal(ok.he, 'משה'); assert.match(ok.id, /^p_/);
  const { people, errors } = normalizePeople([{ first: 'A', month: 'Av', day: 1, id: 'same_id' }, { first: 'B', month: 'Av', day: 2, id: 'same_id' }, { nope: 1 }]);
  assert.equal(people.length, 2); assert.equal(errors.length, 1); assert.notEqual(people[0].id, people[1].id);
});

test('labels', () => {
  assert.equal(birthdayLabel(P('A', 'B', 'Adar II', 23)), '23 Adar II');
  assert.equal(birthdayLabel(P('A', 'B', 'Adar II', 23), 'he'), 'כ״ג אדר ב׳');
  assert.equal(shortName(P('Moshe', 'cohen', 'Av', 1)), 'Moshe C.');
  assert.equal(shortName({ first: 'Moshe', last: '' }), 'Moshe');
});

test('isBirthdayOn: plain month, Adar in leap and common years, 30th of a short month', () => {
  // 2026-10-20 = 9 Heshvan 5787
  assert.equal(isBirthdayOn(P('A', 'B', 'Heshvan', 9), '2026-10-20'), true);
  assert.equal(isBirthdayOn(P('A', 'B', 'Heshvan', 9), '2026-10-21'), false);
  // 2026-03-10 = 21 Adar 5786 (common year): Adar, Adar I and Adar II birthdays all land on Adar
  for (const m of ['Adar', 'Adar I', 'Adar II']) assert.equal(isBirthdayOn(P('A', 'B', m, 21), '2026-03-10'), true, m);
  // 2024-03-10 = 30 Adar I 5784 (leap): only Adar I; a plain Adar birthday waits for Adar II
  assert.equal(isBirthdayOn(P('A', 'B', 'Adar I', 30), '2024-03-10'), true);
  assert.equal(isBirthdayOn(P('A', 'B', 'Adar', 30 - 9), '2024-03-10'), false);
  const adarII14 = hebrewDateOf('2024-03-24'); // 14 Adar II 5784
  assert.equal(adarII14.month, 'Adar II'); assert.equal(adarII14.d, 14);
  assert.equal(isBirthdayOn(P('A', 'B', 'Adar', 14), '2024-03-24'), true);
  assert.equal(isBirthdayOn(P('A', 'B', 'Adar I', 14), '2024-03-24'), false);
  // 30 Kislev in a year where Kislev has 29 days -> 1 Tevet
  let found = null;
  for (let y = 2020; y < 2040 && !found; y++) {
    for (let d = 1; d < 366; d++) {
      const iso = new Date(Date.UTC(y, 0, d, 12)).toISOString().slice(0, 10);
      const h = hebrewDateOf(iso);
      if (h.month === 'Kislev' && h.d === 29 && hebrewDateOf(new Date(Date.UTC(y, 0, d + 1, 12)).toISOString().slice(0, 10)).d === 1) { found = new Date(Date.UTC(y, 0, d + 1, 12)).toISOString().slice(0, 10); break; }
    }
  }
  assert.ok(found, 'a short Kislev exists');
  assert.equal(isBirthdayOn(P('A', 'B', 'Kislev', 30), found), true);
});

test('showDaysFor: Shabbos birthdays show Thursday and Sunday', () => {
  // 2026-10-24 is a Shabbos, 2026-10-23 a Friday
  assert.deepEqual(showDaysFor('2026-10-24'), ['2026-10-22', '2026-10-25']);
  assert.deepEqual(showDaysFor('2026-10-23'), ['2026-10-23']);
  assert.deepEqual(showDaysFor('2026-10-23', { fridayIsWeekend: true }), ['2026-10-22', '2026-10-25']);
  assert.deepEqual(showDaysFor('2026-10-21'), ['2026-10-21']);
});

test('birthdaysFor: today, yesterday and the next two days, plus the Shabbos shift', () => {
  // 2026-10-20 (Tuesday) = 9 Heshvan. 10 Heshvan = Wednesday 21st, 8 Heshvan = Monday 19th, 11 = Thursday 22nd, 13 Heshvan = Shabbos 24th.
  const people = [P('Today', 'A', 'Heshvan', 9), P('Yest', 'B', 'Heshvan', 8), P('Tom', 'C', 'Heshvan', 10), P('Thu', 'D', 'Heshvan', 11), P('Shab', 'E', 'Heshvan', 13), P('Far', 'F', 'Heshvan', 25)];
  const tue = birthdaysFor(people, '2026-10-20');
  assert.deepEqual(tue.today.map((x) => x.person.first), ['Today']);
  assert.deepEqual(tue.recent.map((x) => [x.person.first, x.label]), [['Yest', 'Yesterday']]);
  assert.deepEqual(tue.upcoming.map((x) => [x.person.first, x.label]), [['Tom', 'Tomorrow'], ['Thu', 'Thursday']]);
  // Thursday: the Shabbos birthday shows already ('early'); Sunday: still shows ('late')
  const thu = birthdaysFor(people, '2026-10-22');
  assert.deepEqual(thu.today.map((x) => [x.person.first, x.kind]), [['Thu', 'today'], ['Shab', 'early']]);
  const fri = birthdaysFor(people, '2026-10-23');
  assert.deepEqual(fri.today, []);
  assert.deepEqual(fri.upcoming.map((x) => [x.person.first, x.label]), [['Shab', 'Shabbos']]);
  const sun = birthdaysFor(people, '2026-10-25');
  assert.deepEqual(sun.today.map((x) => [x.person.first, x.kind]), [['Shab', 'late']]);
  const mon = birthdaysFor(people, '2026-10-26');
  assert.deepEqual(mon.today, []);
  assert.deepEqual(mon.recent.map((x) => [x.person.first, x.label]), [['Shab', 'Shabbos']]);
  // lookAhead 0 = no small strips
  const none = birthdaysFor(people, '2026-10-20', { lookAhead: 0 });
  assert.deepEqual([none.recent.length, none.upcoming.length], [0, 0]);
});

test('settings and kiosk view', () => {
  assert.deepEqual(normalizeSettings({ lookAhead: 99, names: 'x', rail: false, fridayIsWeekend: 'yes' }), { fridayIsWeekend: false, lookAhead: 7, names: 'full', rail: false });
  assert.deepEqual(normalizeSettings(null), { fridayIsWeekend: false, lookAhead: 2, names: 'full', rail: true });
  const k = forKiosk({ people: [{ first: 'A', last: 'B', month: 'Av', day: 1, extra: 'x' }] });
  assert.deepEqual(Object.keys(k.people[0]).sort(), ['day', 'first', 'id', 'last', 'month']);
});

test('birthday copy: blessing is stable per day, strips group by label, rail card', async () => {
  const { pickBlessing, stripText, railNote, tagFor, BLESSINGS } = await import('../src/shared/birthdayCopy.js');
  assert.equal(pickBlessing('2026-10-20'), pickBlessing('2026-10-20'));
  assert.ok(BLESSINGS.includes(pickBlessing('2026-10-21')));
  const it = (first, last, label) => ({ person: P(first, last, 'Av', 1), label });
  assert.equal(stripText([it('A', 'B', 'Yesterday'), it('C', 'D', 'Yesterday'), it('E', 'F', 'Tomorrow')]), 'Yesterday: A B, C D  ·  Tomorrow: E F');
  assert.equal(stripText([it('A', 'B', 'Tomorrow'), it('C', 'D', 'Tomorrow'), it('E', 'F', 'Tomorrow')], 'short', 2), 'Tomorrow: A B., C D.  +1 more');
  assert.equal(stripText([]), '');
  assert.equal(tagFor('today'), '');
  assert.equal(tagFor('early'), 'Birthday is this Shabbos');
  assert.equal(railNote([]), null);
  const n = railNote([{ person: P('Moshe', 'Cohen', 'Av', 1) }, { person: P('Dovid', 'Levi', 'Av', 1) }]);
  assert.equal(n.textEn, 'Birthday today: Moshe Cohen, Dovid Levi');
  assert.equal(n.textHe, 'מזל טוב!');
});

test('roster.edit capability: route rule, tab, and the Full editor preset', async () => {
  const perms = await import('../src/shared/permissions.js');
  assert.ok(perms.isCapability('roster.edit'));
  assert.ok(perms.PRESETS.full.caps.includes('roster.edit'));
  assert.ok(!perms.PRESETS.messages.caps.includes('roster.edit'));
  assert.equal(perms.canOpenSection({ role: 'editor', caps: ['roster.edit'] }, 'roster'), true);
});
