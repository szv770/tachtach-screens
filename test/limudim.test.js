import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gematria, fromGematria, perakimText, lookupHilchos, parseRambam, parseSeferHamitzvos, rambamTrack } from '../src/shared/limudim.js';

test('gematria with geresh/gershayim', () => {
  assert.equal(gematria(4), 'ד׳');
  assert.equal(gematria(22), 'כ״ב');
  assert.equal(gematria(15), 'ט״ו');
  assert.equal(gematria(16), 'ט״ז');
  assert.equal(gematria(10), 'י׳');
  assert.equal(gematria(353), 'שנ״ג');
  assert.equal(fromGematria('כב'), 22);
  assert.equal(fromGematria('כ״ב'), 22);
  assert.equal(fromGematria("ד'"), 4);
  assert.equal(fromGematria('שנג'), 353);
});

test('perakim wording is the same for every track', () => {
  assert.deepEqual(perakimText([22]), { he: 'פרק כ״ב', en: 'Perek 22' });
  assert.deepEqual(perakimText([1, 2, 3]), { he: 'פרקים א׳–ג׳', en: 'Perakim 1–3' });
  assert.deepEqual(perakimText([4, 9]), { he: 'פרקים ד׳, ט׳', en: 'Perakim 4, 9' });
  assert.deepEqual(perakimText([]), { he: '', en: '' });
  assert.equal(rambamTrack(1).en, 'Rambam · 1 perek a day');
  assert.equal(rambamTrack(3).en, 'Rambam · 3 perakim a day');
});

test('halachos → sefer lookup, Hebrew and English spellings', () => {
  assert.equal(lookupHilchos('שבת', true).sefer.he, 'ספר זמנים');
  assert.equal(lookupHilchos('הלכות איסורי ביאה', true).sefer.he, 'ספר קדושה');
  assert.equal(lookupHilchos('תפלה וברכת כהנים', true).sefer.he, 'ספר אהבה');
  assert.equal(lookupHilchos('Shabbos', false).sefer.en, 'Sefer Zmanim');
  assert.equal(lookupHilchos('Shabbat', false).sefer.en, 'Sefer Zmanim');
  assert.equal(lookupHilchos('Forbidden Intercourse', false).sefer.en, 'Sefer Kedushah');
  assert.equal(lookupHilchos('Sotah', false).sefer.en, 'Sefer Nashim');
  assert.equal(lookupHilchos('Tefillin, Mezuzah and Sefer Torah', false).sefer.en, 'Sefer Ahavah');
  assert.equal(lookupHilchos('Shvitat Yom Tov', false).he, 'שביתת יום טוב');
  assert.equal(lookupHilchos('Nonsense words', false), null);
});

test('one-perek track (Chabad RSS shape)', () => {
  const r = parseRambam({ displayEn: 'Shabbat - Chapter 22', displayHe: 'הלכות שבת פרק כב' });
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].sefer.he, 'ספר זמנים');
  assert.equal(r.groups[0].hilchos[0].he, 'הלכות שבת');
  assert.equal(r.groups[0].hilchos[0].en, 'Shabbat');
  assert.deepEqual(r.groups[0].hilchos[0].text, { he: 'פרק כ״ב', en: 'Perek 22' });
});

test('three-perakim track spanning two halachos and two sefarim', () => {
  const r = parseRambam({
    displayEn: 'Sotah - Chapter 4, Issurei Biah - Chapter 1, Issurei Biah - Chapter 2',
    displayHe: 'הלכות סוטה פרק ד, הלכות איסורי ביאה פרק א, הלכות איסורי ביאה פרק ב',
  });
  assert.equal(r.groups.length, 2);
  assert.equal(r.groups[0].sefer.he, 'ספר נשים');
  assert.equal(r.groups[1].sefer.he, 'ספר קדושה');
  assert.deepEqual(r.groups[1].hilchos[0].perakim, [1, 2]);
  assert.equal(r.groups[1].hilchos[0].text.he, 'פרקים א׳–ב׳');
  assert.deepEqual(r.perakim, [4, 1, 2]);
});

test('three perakim of one halachos merge into a range; explicit sefer prefix', () => {
  const r = parseRambam({
    displayEn: 'Mishneh Torah, Sefer Zmanim, Shabbos - Chapter 4, Shabbos - Chapter 5, Shabbos - Chapter 6',
    displayHe: 'משנה תורה, ספר זמנים, שבת - פרק ד, שבת - פרק ה, שבת - פרק ו',
  });
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].sefer.he, 'ספר זמנים');
  assert.equal(r.groups[0].hilchos.length, 1);
  assert.equal(r.groups[0].hilchos[0].text.en, 'Perakim 4–6');
  assert.equal(r.groups[0].hilchos[0].text.he, 'פרקים ד׳–ו׳');
});

test('ranges, word numbers and English-only input', () => {
  const a = parseRambam({ displayEn: 'Shabbat - Chapters 1-3', displayHe: '' });
  assert.deepEqual(a.groups[0].hilchos[0].perakim, [1, 2, 3]);
  assert.equal(a.groups[0].hilchos[0].he, 'הלכות שבת');
  const b = parseRambam({ displayEn: 'Sotah - Chapter Four', displayHe: '' });
  assert.deepEqual(b.groups[0].hilchos[0].perakim, [4]);
  const c = parseRambam({ displayEn: 'Something odd', displayHe: '' });
  assert.equal(c.groups.length, 0);
  assert.equal(c.raw.en, 'Something odd');
  assert.equal(parseRambam({ displayEn: '', displayHe: '' }), null);
});

test('Sefer HaMitzvos', () => {
  const s = parseSeferHamitzvos({ displayEn: 'Negative Commandment 353, Positive Commandment 220', displayHe: 'מצות לא תעשה שנג, מצות עשה רכ' });
  assert.deepEqual(s.items.map((i) => i.he), ['מצות לא תעשה שנ״ג', 'מצות עשה ר״כ']);
  assert.deepEqual(s.items.map((i) => i.en), ['Negative mitzvah 353', 'Positive mitzvah 220']);
  const e = parseSeferHamitzvos({ displayEn: 'Positive Commandment 13', displayHe: '' });
  assert.equal(e.items[0].he, 'מצות עשה י״ג');
  const raw = parseSeferHamitzvos({ displayEn: 'Introduction', displayHe: '' });
  assert.equal(raw.items.length, 0);
  assert.equal(raw.raw.en, 'Introduction');
});
