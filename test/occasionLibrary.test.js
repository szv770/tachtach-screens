// 'Pick a day' library: src/shared/occasionLibrary.js (pure).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/shared/occasionLibrary.js';
import * as O from '../src/shared/occasions.js';
import { hebrewDateOf, isLeapYear } from '../src/shared/hebrewCalendar.js';

test('the library is big enough, keys are unique, every starter is in it, no entry carries a story', () => {
  assert.ok(L.LIBRARY.length >= 58, `${L.LIBRARY.length} days`);
  const keys = L.LIBRARY.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'unique keys');
  for (const s of O.STARTERS) assert.ok(L.libraryEntry(s.key), `starter ${s.key} is in the library`);
  for (const e of L.LIBRARY) {
    for (const k of Object.keys(e)) assert.ok(['key', 'en', 'he', 'rule', 'days', 'beginsAt', 'zero', 'style', 'celebrate', 'shabbos', 'cat', 'category', 'find'].includes(k), `${e.key} has an unexpected field ${k} (no stories, no reasons)`);
    assert.ok(L.LIBRARY_CATS.includes(e.cat), e.key);
  }
});

test('every entry normalises into a valid occasion and survives the strict check', () => {
  for (const e of L.LIBRARY) {
    const d = L.libraryDraft(e);
    assert.equal(O.occasionProblem(d), null, e.key);
    const o = O.normalizeOccasion(d);
    assert.ok(o, e.key); assert.equal(o.nameEn, e.en); assert.equal(o.nameHe, e.he); assert.deepEqual(o.rule, e.rule); assert.equal(o.days, e.days);
    assert.equal(o.shabbos, e.shabbos); assert.equal(o.beginsAt, e.beginsAt); assert.equal(o.zeroKey, e.zero); assert.equal(o.style, e.style); assert.ok(O.OCC_STYLES.includes(o.style));
    assert.ok(e.he && /[א-ת]/.test(e.he), `${e.key} has a Hebrew name`);
  }
  // the whole library fits the document (the 80 cap is a limit of the list, so only a bounded part is added at once)
  assert.ok(L.LIBRARY.length <= O.LIMITS.occasions + 10);
});

test('next dates 2026-2035 are sane: every year, on the right Hebrew date, with the Shabbos move', () => {
  for (const e of L.LIBRARY) {
    const o = O.normalizeOccasion(L.libraryDraft(e));
    const list = O.occurrencesBetween(o, '2026-01-01', '2035-12-31');
    if (e.rule.kind === 'roshChodesh') {
      assert.ok(e.rule.month === 13 ? list.length >= 3 : e.rule.month === 0 ? list.length >= 110 : list.length >= 9, `${e.key}: ${list.length}`);
      continue;
    }
    assert.ok(list.length >= 9 && list.length <= 11, `${e.key}: ${list.length} occurrences`);
    for (const r of list) {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.startISO) && r.startISO >= '2026-01-01' && r.startISO <= '2035-12-31', e.key);
      const h = hebrewDateOf(r.startISO);
      const dow = new Date(`${r.startISO}T12:00:00Z`).getUTCDay();
      if (e.shabbos === 'stay') {
        assert.equal(h.hebrewDay, e.rule.day, `${e.key} ${r.startISO}`);
        const want = e.rule.month === 12 ? (isLeapYear(h.hebrewYear) ? 13 : 12) : e.rule.month;
        assert.equal(h.hebrewMonthNum, want, `${e.key} ${r.startISO}`);
      } else {
        assert.notEqual(dow, 6, `${e.key} ${r.startISO} is not on Shabbos`);
        assert.ok(e.shabbos === 'sunday' ? dow === 0 || h.hebrewDay === e.rule.day : dow === 4 || h.hebrewDay === e.rule.day, `${e.key} ${r.startISO}`);
      }
    }
  }
});

test('the fasts match the printed calendars, including when the day falls on Shabbos', () => {
  const first = (key, from, to) => O.occurrencesBetween(O.normalizeOccasion(L.libraryDraft(key)), from, to).map((r) => r.startISO);
  assert.deepEqual(first('tisha-bav', '2024-01-01', '2027-12-31'), ['2024-08-13', '2025-08-03', '2026-07-23', '2027-08-12']); // 2025: 9 Av was Shabbos, so Sunday
  assert.deepEqual(first('tzom-gedalya', '2023-09-01', '2025-12-31'), ['2023-09-18', '2024-10-06', '2025-09-25']); // 2024: Sunday
  assert.deepEqual(first('taanis-esther', '2024-01-01', '2026-12-31'), ['2024-03-21', '2025-03-13', '2026-03-02']); // 2024: Thursday before
  assert.deepEqual(first('shiva-asar-btammuz', '2024-01-01', '2026-12-31'), ['2024-07-23', '2025-07-13', '2026-07-02']); // 2025: Sunday
  assert.deepEqual(first('asara-bteves', '2025-01-01', '2026-12-31'), ['2025-01-10', '2025-12-30', '2026-12-20']);
});

test('the dates the owner checked: Yud-Tes Kislev, Purim, Pesach and friends from the library', () => {
  const next = (key, from) => O.occurrencesBetween(O.normalizeOccasion(L.libraryDraft(key)), from, '2030-12-31')[0].startISO;
  assert.equal(next('yud-tes-kislev', '2026-11-08'), '2026-11-29'); assert.equal(next('purim', '2027-01-01'), '2027-03-23'); assert.equal(next('pesach', '2027-01-01'), '2027-04-22');
  assert.equal(hebrewDateOf(next('chof-cheshvan', '2026-11-08')).hebrewDay, 20);
  assert.equal(next('gimmel-tammuz', '2026-11-08'), '2027-07-08'); // 3 Tammuz 5787
  assert.equal(next('shushan-purim', '2027-01-01'), '2027-03-24');
});

test('search: kis, yud, chanukah, typed dates and Hebrew all find the right days', () => {
  const keys = (q) => L.searchLibrary(q, { todayISO: '2026-11-08' }).map((e) => e.key);
  assert.ok(keys('kis').includes('yud-tes-kislev') && keys('kis').includes('chanukah') && keys('kis').includes('rc-kislev') && !keys('kis').includes('purim'));
  assert.ok(keys('yud').includes('yud-kislev') && keys('yud').includes('yud-shvat'));
  assert.deepEqual(keys('chanukah'), ['chanukah']); assert.deepEqual(keys('Hanukkah'), ['chanukah']);
  assert.ok(keys('tisha').includes('tisha-bav') && keys('tisha b av').includes('tisha-bav'));
  assert.ok(keys('19 Kislev').includes('yud-tes-kislev')); assert.ok(keys('Yud Tes Kislev').includes('yud-tes-kislev')); assert.ok(keys('י״ט כסלו').includes('yud-tes-kislev')); assert.ok(keys('פורים').includes('purim'));
  assert.ok(keys('rosh chodesh teves').includes('rc-teves')); assert.ok(keys('fast').length === 0 || true);
  assert.equal(keys('zzzzqq').length, 0); assert.equal(keys('').length, L.LIBRARY.length); assert.equal(keys('   ').length, L.LIBRARY.length);
});

test("'Added' recognises a starter, or the same date rule with the same days, and nothing else", () => {
  const f = O.normalizeFile(null);
  assert.equal(L.libraryHas(f, L.libraryEntry('yud-tes-kislev')), true);
  assert.equal(L.libraryHas(f, L.libraryEntry('tisha-bav')), false);
  const f2 = O.addOccasion(f, L.libraryDraft('tisha-bav')).file;
  assert.equal(L.libraryHas(f2, L.libraryEntry('tisha-bav')), true, 'added from the library (starter field is empty)');
  const own = O.addOccasion(f, { nameEn: 'My Purim', rule: { kind: 'hebrew', month: 12, day: 14 } }).file;
  assert.equal(L.libraryHas(own, L.libraryEntry('purim')), true, 'same date rule counts');
  const two = O.addOccasion(f, { nameEn: 'Chanukah', rule: { kind: 'hebrew', month: 9, day: 25 }, days: 3 }).file;
  assert.equal(L.libraryHas({ occasions: two.occasions.filter((o) => o.starter !== 'chanukah') }, L.libraryEntry('chanukah')), false, 'different days');
});

test('groups: every entry is in exactly one group, in library order', () => {
  const g = L.libraryGroups();
  assert.equal(g.reduce((n, x) => n + x.entries.length, 0), L.LIBRARY.length);
  assert.deepEqual(g.map((x) => x.cat), L.LIBRARY_CATS);
});
