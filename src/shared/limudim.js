/**
 * Daily-study (Limudim) parsing for the kiosk's learning page — pure, unit-
 * tested (test/limudim.test.js). Turns the free-text Chabad.org RSS lines in
 * cache.rambam1 / cache.rambam3 / cache.seferHamitzvot into structure, so the
 * page can show a clear hierarchy (owner request, docs/BACKLOG.md):
 *
 *   Sefer (ספר זמנים)  →  Halachos (הלכות שבת)  →  perakim (פרק כ״ב / פרקים א׳–ג׳)
 *
 * The RSS gives only "Shabbat - Chapter 22" / "הלכות שבת פרק כב" (no sefer),
 * so the sefer is looked up from the halachos name (all 83 halachos of the
 * Mishneh Torah, Hebrew + common English spellings). Every input shape seen
 * in the fetchers is accepted:
 *   "Shabbat - Chapter 22"
 *   "Sotah - Chapter 4, Issurei Biah - Chapter 1, Issurei Biah - Chapter 2"
 *   "Mishneh Torah, Sefer Zmanim, Shabbos - Chapter 4"
 *   "הלכות סוטה פרק ד, הלכות איסורי ביאה פרק א"  /  "משנה תורה, ספר זמנים, שבת - פרק ד"
 *   "Chapters 1-3", "פרקים א-ג"
 * Unknown text never disappears: an unparsable line comes back as `raw`.
 */

// ── Hebrew numerals ────────────────────────────────────────────────────────
const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** 22 → "כ״ב", 4 → "ד׳", 15 → "ט״ו", 353 → "שנ״ג". */
export function gematria(n) {
  n = Math.floor(Number(n));
  if (!(n > 0 && n < 1000)) return String(n);
  let s = HUNDREDS[Math.floor(n / 100)];
  let r = n % 100;
  if (r === 15) s += 'טו';
  else if (r === 16) s += 'טז';
  else s += TENS[Math.floor(r / 10)] + ONES[r % 10];
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}

const LETTER_VAL = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
/** "כב" / "כ״ב" / "ד'" → 22 / 22 / 4; digits pass through; else NaN. */
export function fromGematria(str) {
  const t = String(str || '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  const letters = t.replace(/[׳״'"`]/g, '');
  if (!letters || /[^א-ת]/.test(letters)) return NaN;
  let v = 0;
  for (const ch of letters) v += LETTER_VAL[ch] || 0;
  return v || NaN;
}

const EN_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30 };
function enNumber(str) {
  const t = String(str || '').trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(/[\s-]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => !(p in EN_WORDS))) return NaN;
  return parts.reduce((a, p) => a + EN_WORDS[p], 0);
}

// ── Perakim wording ────────────────────────────────────────────────────────
/** Collapse [1,2,3,5] → [[1,3],[5,5]]. Keeps reading order; no sorting. */
export function runs(nums) {
  const out = [];
  for (const n of nums) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

/**
 * The perakim line, Hebrew and English, worded the same way for every track:
 *   [22]        → { he: 'פרק כ״ב',        en: 'Perek 22' }
 *   [1, 2, 3]   → { he: 'פרקים א׳–ג׳',     en: 'Perakim 1–3' }
 *   [4, 9]      → { he: 'פרקים ד׳, ט׳',    en: 'Perakim 4, 9' }
 */
export function perakimText(nums) {
  const list = (nums || []).filter((n) => n > 0);
  if (!list.length) return { he: '', en: '' };
  const r = runs(list);
  const many = list.length > 1;
  const he = r.map(([a, b]) => (a === b ? gematria(a) : `${gematria(a)}–${gematria(b)}`)).join(', ');
  const en = r.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ');
  return { he: `${many ? 'פרקים' : 'פרק'} ${he}`, en: `${many ? 'Perakim' : 'Perek'} ${en}` };
}

// ── Mishneh Torah: sefarim and their halachos ──────────────────────────────
// [Hebrew halachos name, English spellings (Chabad / Sefaria / Ashkenazi)…]
const SEFARIM = [
  { he: 'ספר המדע', en: 'Sefer HaMadda', hilchos: [
    ['יסודי התורה', 'Yesodei HaTorah', 'Foundations of the Torah'], ['דעות', "De'ot", 'Deos', 'Human Dispositions'], ['תלמוד תורה', 'Talmud Torah', 'Torah Study'],
    ['עבודה זרה וחוקות הגוים', 'Avodah Zarah', 'Avodat Kochavim', 'Avodas Kochavim', 'Foreign Worship and Customs of the Nations'], ['תשובה', 'Teshuvah', 'Repentance'],
  ] },
  { he: 'ספר אהבה', en: 'Sefer Ahavah', hilchos: [
    ['קריאת שמע', "Kri'at Shema", 'Krias Shema', 'Reading the Shema'], ['תפילה וברכת כהנים', 'Tefillah and Birkat Kohanim', 'Tefilah', 'Prayer and the Priestly Blessing'],
    ['תפילין ומזוזה וספר תורה', 'Tefillin, Mezuzah and Sefer Torah', 'Tefillin, Mezuzah and the Torah Scroll'], ['ציצית', 'Tzitzit', 'Tzitzis', 'Fringes'],
    ['ברכות', 'Berachot', 'Brachos', 'Blessings'], ['מילה', 'Milah', 'Circumcision'], ['סדר התפילות', 'Seder Tefillot', 'Order of Prayers'],
  ] },
  { he: 'ספר זמנים', en: 'Sefer Zmanim', hilchos: [
    ['שבת', 'Shabbat', 'Shabbos', 'Sabbath'], ['עירובין', 'Eruvin', 'Eruvin'], ['שביתת עשור', 'Shvitat Asor', 'Shevisas Asor', 'Rest on the Tenth of Tishrei'],
    ['שביתת יום טוב', 'Shvitat Yom Tov', 'Shevisas Yom Tov', 'Rest on a Holiday'], ['חמץ ומצה', "Chametz U'Matzah", 'Chametz uMatzah', 'Leavened and Unleavened Bread'],
    ['שופר וסוכה ולולב', 'Shofar, Sukkah, VeLulav', 'Shofar', 'Shofar, Sukkah and Lulav', 'Shofar, Sukkah and Lulav'], ['שקלים', 'Shekalim', 'Sheqel Dues'],
    ['קידוש החודש', 'Kiddush HaChodesh', 'Sanctification of the New Month'], ['תעניות', "Ta'aniyot", 'Taaniyos', 'Fasts'], ['מגילה וחנוכה', 'Megillah vChanukah', 'Megillah and Chanukah', 'Scroll of Esther and Hanukkah'],
  ] },
  { he: 'ספר נשים', en: 'Sefer Nashim', hilchos: [
    ['אישות', 'Ishut', 'Ishus', 'Marriage'], ['גירושין', 'Gerushin', 'Divorce'], ['יבום וחליצה', 'Yibbum vChalitzah', 'Levirate Marriage and Release'],
    ['נערה בתולה', "Na'arah Betulah", 'Naarah Besulah', 'Virgin Maiden'], ['סוטה', 'Sotah', 'Woman Suspected of Infidelity'],
  ] },
  { he: 'ספר קדושה', en: 'Sefer Kedushah', hilchos: [
    ['איסורי ביאה', 'Issurei Biah', "Issurei Bi'ah", 'Forbidden Intercourse', 'Forbidden Relations'], ['מאכלות אסורות', "Ma'achalot Assurot", 'Maachalos Asuros', 'Forbidden Foods'], ['שחיטה', 'Shechitah', 'Ritual Slaughter'],
  ] },
  { he: 'ספר הפלאה', en: 'Sefer Haflaah', hilchos: [
    ['שבועות', 'Shevuot', 'Shevuos', 'Oaths'], ['נדרים', 'Nedarim', 'Vows'], ['נזירות', 'Nezirut', 'Nezirus', 'Nazariteship'], ['ערכין וחרמין', 'Arachim Vacharamim', 'Appraisals and Devoted Property'],
  ] },
  { he: 'ספר זרעים', en: 'Sefer Zeraim', hilchos: [
    ['כלאים', 'Kilaayim', 'Kilayim', 'Diverse Species'], ['מתנות עניים', 'Matnot Aniyim', 'Matnos Aniyim', 'Gifts to the Poor'], ['תרומות', 'Terumot', 'Terumos', 'Heave Offerings'],
    ['מעשרות', 'Maaser', "Ma'aser", 'Maasros', 'Tithes'], ['מעשר שני ונטע רבעי', 'Maaser Sheni', "Ma'aser Sheni", 'Second Tithes and Fourth Year Fruit'],
    ['ביכורים ושאר מתנות כהונה שבגבולין', 'Bikkurim', 'First Fruits and other Gifts to Priests Outside the Sanctuary'], ['שמיטה ויובל', 'Shemitah and Yovel', 'Shmitah vYovel', 'Sabbatical Year and the Jubilee'],
  ] },
  { he: 'ספר עבודה', en: 'Sefer Avodah', hilchos: [
    ['בית הבחירה', 'Beit Habechirah', 'Beis Habechirah', 'The Chosen Temple'], ['כלי המקדש והעובדים בו', "K'lei Hamikdash", 'Klei HaMikdash', 'Vessels of the Sanctuary and Those Who Serve Therein'],
    ['ביאת המקדש', "Bi'at Hamikdash", 'Bias HaMikdash', 'Admission into the Sanctuary'], ['איסורי מזבח', 'Issurei Mizbeiach', 'Things Forbidden on the Altar'],
    ['מעשה הקרבנות', "Ma'aseh Hakorbanot", 'Maaseh HaKorbanos', 'Sacrificial Procedure'], ['תמידין ומוספין', 'Temidin uMusafim', 'Daily Offerings and Additional Offerings'],
    ['פסולי המוקדשין', 'Pesulei Hamukdashim', 'Sacrifices Rendered Unfit'], ['עבודת יום הכפורים', 'Avodat Yom haKippurim', 'Avodas Yom HaKippurim', 'Service on the Day of Atonement'], ['מעילה', "Me'ilah", 'Meilah', 'Trespass'],
  ] },
  { he: 'ספר קרבנות', en: 'Sefer Korbanot', hilchos: [
    ['קרבן פסח', 'Korban Pesach', 'Paschal Offering'], ['חגיגה', 'Chagigah', 'Festival Offering'], ['בכורות', 'Bechorot', 'Bechoros', 'Firstlings'], ['שגגות', 'Shegagot', 'Shegagos', 'Offerings for Unintentional Transgressions'],
    ['מחוסרי כפרה', 'Mechussarey Kapparah', 'Mechusrei Kaparah', 'Offerings for Those with Incomplete Atonement'], ['תמורה', 'Temurah', 'Substitution'],
  ] },
  { he: 'ספר טהרה', en: 'Sefer Taharah', hilchos: [
    ['טומאת מת', "Tum'at Met", 'Tumas Meis', 'Defilement by a Corpse'], ['פרה אדומה', 'Parah Adumah', 'Red Heifer'], ['טומאת צרעת', "Tum'at Tsara'at", 'Tumas Tzaraas', 'Defilement by Leprosy'],
    ['מטמאי משכב ומושב', "Metamme'ey Mishkav uMoshav", 'Metamei Mishkav uMoshav', 'Those Who Defile Bed or Seat'], ['שאר אבות הטומאות', "She'ar Avot haTum'ah", 'Shear Avos HaTumos', 'Other Sources of Defilement'],
    ['טומאת אוכלין', "Tum'at Ochalin", 'Tumas Ochalin', 'Defilement of Foods'], ['כלים', 'Kelim', 'Vessels'], ['מקואות', "Mikva'ot", 'Mikvaos', 'Immersion Pools'],
  ] },
  { he: 'ספר נזיקין', en: 'Sefer Nezikin', hilchos: [
    ['נזקי ממון', 'Nizkei Mamon', 'Damages to Property'], ['גניבה', 'Genevah', 'Theft'], ['גזילה ואבידה', "Gezelah va'Avedah", 'Gezeilah vaAveidah', 'Robbery and Lost Property'],
    ['חובל ומזיק', 'Chovel uMazik', 'One Who Injures a Person or Property'], ['רוצח ושמירת נפש', 'Rotzeach uShmirat Nefesh', 'Rotzeach uShmiras Nefesh', 'Murderer and the Preservation of Life'],
  ] },
  { he: 'ספר קנין', en: 'Sefer Kinyan', hilchos: [
    ['מכירה', 'Mechirah', 'Sales'], ['זכייה ומתנה', 'Zechiyah uMattanah', 'Zechiyah uMatanah', 'Ownerless Property and Gifts'], ['שכנים', 'Shechenim', 'Shecheinim', 'Neighbors'],
    ['שלוחין ושותפין', 'Sheluchin veShuttafin', 'Sheluchin vShutafin', 'Agents and Partners'], ['עבדים', 'Avadim', 'Slaves'],
  ] },
  { he: 'ספר משפטים', en: 'Sefer Mishpatim', hilchos: [
    ['שכירות', 'Sechirut', 'Sechirus', 'Hiring'], ['שאלה ופקדון', "She'elah uFikkadon", 'Sheeilah uFikadon', 'Borrowing and Deposit'], ['מלוה ולוה', 'Malveh veLoveh', 'Creditor and Debtor'],
    ['טוען ונטען', "To'en veNit'an", 'Toein vNitan', 'Plaintiff and Defendant'], ['נחלות', 'Nachalot', 'Nachalos', 'Inheritances'],
  ] },
  { he: 'ספר שופטים', en: 'Sefer Shoftim', hilchos: [
    ['סנהדרין והעונשין המסורין להם', 'Sanhedrin', 'The Sanhedrin and the Penalties within their Jurisdiction'], ['עדות', 'Edut', 'Eidus', 'Testimony'], ['ממרים', 'Mamrim', 'Rebels'],
    ['אבל', 'Evel', 'Avel', 'Mourning'], ['מלכים ומלחמות', 'Melachim uMilchamot', 'Melachim uMilchamoteihem', 'Kings and Wars'],
  ] },
];

// Normalisation: Hebrew without niqqud, matres lectionis (י/ו), final forms
// or punctuation; English loosely: doubled letters, ei = e, final h, final
// s = t (Shevuos = Shevuot). Shabbos/Shabbat etc. are listed as aliases.
const FINALS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
function normHe(s) {
  return String(s || '').replace(/[֑-ׇ]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]).replace(/[^א-ת]/g, '').replace(/[יו]/g, '');
}
function normEn(s) {
  return String(s || '').toLowerCase()
    .replace(/^(the\s+)?(laws?\s+(of|concerning)\s+|hilchot\s+|hilchos\s+|hilkhot\s+)/, '')
    .replace(/kh/g, 'ch').replace(/'/g, '').split(/[^a-z]+/).filter(Boolean)
    .map((w) => w.replace(/(.)\1+/g, '$1').replace(/ei/g, 'e').replace(/y/g, 'i').replace(/h$/, '').replace(/s$/, 't'))
    .join('');
}

const INDEX = [];
for (const s of SEFARIM) {
  for (const [he, ...en] of s.hilchos) {
    INDEX.push({ he, en: en[0], sefer: { he: s.he, en: s.en }, keysHe: [normHe(he)], keysEn: en.map(normEn) });
  }
}

/** Halachos name (Hebrew or English) → { he, en, sefer: {he, en} } or null. */
export function lookupHilchos(name, isHe) {
  const key = isHe ? normHe(String(name).replace(/^הלכות\s+/, '')) : normEn(name);
  if (!key) return null;
  const keysOf = (e) => (isHe ? e.keysHe : e.keysEn);
  let hit = INDEX.find((e) => keysOf(e).includes(key));
  if (!hit) {
    // "תפילין ומזוזה" for "תפילין ומזוזה וספר תורה": longest key the name starts with, else a unique key that starts with the name.
    const pre = INDEX.filter((e) => keysOf(e).some((k) => k.length >= 3 && key.startsWith(k))).sort((a, b) => Math.max(...keysOf(b).map((k) => k.length)) - Math.max(...keysOf(a).map((k) => k.length)));
    hit = pre[0] || null;
    if (!hit) {
      const ext = INDEX.filter((e) => key.length >= 4 && keysOf(e).some((k) => k.startsWith(key)));
      hit = ext.length === 1 ? ext[0] : null;
    }
  }
  return hit ? { he: hit.he, en: hit.en, sefer: hit.sefer } : null;
}

const SEFER_BY_HE = Object.fromEntries(SEFARIM.map((s) => [normHe(s.he.replace(/^ספר\s+/, '')), s]));
const SEFER_BY_EN = Object.fromEntries(SEFARIM.map((s) => [normEn(s.en.replace(/^Sefer\s+/i, '')), s]));

// ── Rambam line → structure ────────────────────────────────────────────────
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * One RSS line → [{ name, sefer?, perakim: [n…] }] in reading order.
 * Segments are split on , ; · and the chapter keyword.
 */
function parseLine(text, isHe) {
  let t = strip(text);
  if (!t) return [];
  t = isHe
    ? t.replace(/^(היום[:\s]*)?(שיעור היום[:\s]*)?/, '').replace(/^משנה\s+תורה\s*[,،:-]?\s*/, '')
    : t.replace(/^today'?s lessons?:\s*/i, '').replace(/^Mishneh Torah\s*[,:-]?\s*/i, '');
  const chap = isHe ? /(?:^|[\s,–-])(פרקים|פרק)\s+([א-ת׳״'"]+(?:\s*[-–]\s*[א-ת׳״'"]+)?)/g : /\b(chapters?|perakim|perek)\s+([0-9a-z]+(?:\s*[-–]\s*[0-9a-z]+)?)/gi;
  const items = [];
  let last = 0, m, lastName = '', pendingSefer = null;
  const toNum = isHe ? fromGematria : enNumber;
  while ((m = chap.exec(t)) !== null) {
    let name = t.slice(last, m.index).replace(/^[\s,;·:–-]+|[\s,;·:–-]+$/g, '');
    // "ספר זמנים, שבת" / "Sefer Zmanim, Shabbos": peel an explicit sefer off the front.
    const sm = isHe ? name.match(/^ספר\s+([^,;·]+?)\s*[,;·:–-]\s*(.*)$/) : name.match(/^Sefer\s+([^,;·]+?)\s*[,;·:–-]\s*(.*)$/i);
    if (sm) {
      const s = isHe ? SEFER_BY_HE[normHe(sm[1])] : SEFER_BY_EN[normEn(sm[1])];
      pendingSefer = s ? { he: s.he, en: s.en } : { he: isHe ? `ספר ${sm[1]}` : '', en: isHe ? '' : `Sefer ${sm[1]}` };
      name = sm[2];
    }
    name = name.replace(isHe ? /^הלכות\s+/ : /^(hilchot|hilchos|laws of)\s+/i, '').replace(/[\s–-]+$/, '').trim();
    if (!name) name = lastName;
    const whole = !isHe && /[a-z]/i.test(m[2]) ? enNumber(m[2]) : NaN;
    const [a, b] = whole > 0 ? [whole] : m[2].split(/\s*[-–]\s*/).map(toNum);
    const nums = [];
    if (a > 0) { if (b > a && b - a < 20) for (let i = a; i <= b; i++) nums.push(i); else nums.push(a); }
    if (name && nums.length) items.push({ name, sefer: pendingSefer, perakim: nums });
    lastName = name;
    last = chap.lastIndex;
  }
  return items;
}

/** Merge consecutive segments of the same halachos: [שבת 22][שבת 23] → [שבת 22,23]. */
function mergeSegments(items) {
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && prev.name === it.name) prev.perakim.push(...it.perakim);
    else out.push({ ...it, perakim: [...it.perakim] });
  }
  return out;
}

/**
 * cache.rambam1 / rambam3 → {
 *   groups: [{ sefer: {he, en} | null, hilchos: [{ he, en, perakim: [n…], text: {he, en} }] }],
 *   perakim: [n…] (all, reading order), raw: {he, en} (fallback text)
 * } or null when there is nothing to show.
 */
export function parseRambam(entry) {
  if (!entry) return null;
  const rawHe = strip(entry.displayHe).replace(/^משנה\s+תורה\s*[,،]?\s*/, '');
  const rawEn = strip(entry.displayEn).replace(/^Mishneh Torah\s*,?\s*/i, '');
  if (!rawHe && !rawEn) return null;
  const he = mergeSegments(parseLine(entry.displayHe, true));
  const en = mergeSegments(parseLine(entry.displayEn, false));
  const n = Math.max(he.length, en.length);
  const hilchos = [];
  for (let i = 0; i < n; i++) {
    const h = he[i], e = en[i];
    const look = (h && lookupHilchos(h.name, true)) || (e && lookupHilchos(e.name, false)) || null;
    const perakim = (h?.perakim?.length ? h.perakim : e?.perakim) || [];
    hilchos.push({
      he: h ? `הלכות ${look && normHe(look.he).startsWith(normHe(h.name)) ? look.he : h.name}` : (look ? `הלכות ${look.he}` : ''),
      en: e ? e.name : (look ? look.en : ''),
      sefer: h?.sefer || e?.sefer || look?.sefer || null,
      perakim,
      text: perakimText(perakim),
    });
  }
  if (!hilchos.length) {
    return { groups: [], perakim: entry.chaptersArabic || [], raw: { he: rawHe, en: rawEn } };
  }
  // Group consecutive halachos under one sefer heading.
  const groups = [];
  for (const h of hilchos) {
    const g = groups[groups.length - 1];
    const sameSefer = g && ((g.sefer && h.sefer && g.sefer.he === h.sefer.he) || (!g.sefer && !h.sefer));
    const { sefer, ...rest } = h;
    if (sameSefer) {
      if (!g.sefer && sefer) g.sefer = sefer;
      g.hilchos.push(rest);
    } else groups.push({ sefer, hilchos: [rest] });
  }
  return { groups, perakim: hilchos.flatMap((h) => h.perakim), raw: { he: rawHe, en: rawEn } };
}

/** Track label, worded identically for both tracks. */
export function rambamTrack(perDay) {
  return perDay === 3
    ? { he: 'רמב״ם · ג׳ פרקים ליום', en: 'Rambam · 3 perakim a day' }
    : { he: 'רמב״ם · פרק אחד ליום', en: 'Rambam · 1 perek a day' };
}

// ── Sefer HaMitzvos ────────────────────────────────────────────────────────
/**
 * cache.seferHamitzvot → [{ kind: 'aseh' | 'lo', n, he: 'מצות עשה ר״כ', en: 'Positive mitzvah 220' }]
 * (reading order). Unparsable text comes back as { raw: {he, en} } only.
 */
export function parseSeferHamitzvos(entry) {
  if (!entry) return null;
  const rawHe = strip(entry.displayHe).replace(/^(ספר המצוות|היום)[:\s]*/, '');
  const rawEn = strip(entry.displayEn).replace(/^(today'?s (mitzvah|lesson)s?|daily mitzvah)[:\s]*/i, '');
  if (!rawHe && !rawEn) return null;
  const items = [];
  const reHe = /(מצו?ת|מצוה)\s+(עשה|לא\s*תעשה|ל״ת|ל"ת)\s+([א-ת׳״'"]+)/g;
  let m;
  while ((m = reHe.exec(rawHe)) !== null) {
    const n = fromGematria(m[3]);
    if (n > 0) items.push({ kind: /עשה/.test(m[2]) && !/לא/.test(m[2]) ? 'aseh' : 'lo', n });
  }
  if (!items.length) {
    const reEn = /\b(positive|negative)\s+(?:commandment|mitzvah|mitzvot|mitzvos)?\s*#?(\d+)|\b([PN])\s*(\d+)\b/gi;
    while ((m = reEn.exec(rawEn)) !== null) {
      const kind = (m[1] || m[3]).toLowerCase().startsWith('p') ? 'aseh' : 'lo';
      const n = Number(m[2] || m[4]);
      if (n > 0) items.push({ kind, n });
    }
  }
  const out = items.map((it) => ({
    ...it,
    he: `${it.kind === 'aseh' ? 'מצות עשה' : 'מצות לא תעשה'} ${gematria(it.n)}`,
    kindHe: it.kind === 'aseh' ? 'מצות עשה' : 'מצות לא תעשה',
    numHe: gematria(it.n),
    en: `${it.kind === 'aseh' ? 'Positive' : 'Negative'} mitzvah ${it.n}`,
  }));
  return { items: out, raw: { he: rawHe, en: rawEn } };
}
