/**
 * The words on the birthday slide and rail card, in ONE place (like stageStrings.js) so they are easy to change.
 * Pure + unit tested. English is primary; Hebrew is the extra line.
 */
import { displayName } from './roster.js';

export const HERO_HE = 'מזל טוב!';
export const HERO_EN = 'Happy Birthday';

/**
 * The brocho under the names: a warm blessing in the classic Chassidic style (long life, nachas, hatzlocha in
 * lernen, avodah, Yiras Shomayim, hiskashrus). Written for this screen; NOT presented as anyone's words.
 * English is the main line, Hebrew the second. One a day, chosen by the date (every screen shows the same one
 * all day); consecutive days walk a fixed shuffle, so nothing repeats until all of them have shown.
 */
export const BLESSINGS = Object.freeze([
  { en: 'May you grow to be a chossid, a yerei Shomayim and a lamdan', he: 'שתגדל להיות חסיד, ירא שמים ולמדן' },
  { en: 'Ad meah v\u2019esrim shonim: long, good years, full of Torah and mitzvos', he: 'עד מאה ועשרים שנה, לאורך ימים ושנים טובות' },
  { en: 'May you bring your parents and teachers true yiddishe, chassidishe nachas', he: 'שתגרום נחת יהודי חסידותי להוריך ולמחנכיך' },
  { en: 'Hatzlocha rabbah in your lernen: may every sugya open up for you', he: 'הצלחה רבה בלימוד התורה, בנגלה ובחסידות' },
  { en: 'A year of growth in Yiras Shomayim, in Torah and in avodah', he: 'שנה של עלייה ביראת שמים, בתורה ובעבודה' },
  { en: 'May you always go from strength to strength, mechayil el chayil', he: 'שתלך תמיד מחיל אל חיל' },
  { en: 'May your davening come from the heart and light up your whole day', he: 'שתהיה תפילתך מתוך הלב ותאיר את כל היום' },
  { en: 'Lern with chayus, daven with chayus, and live with simcha', he: 'ללמוד בחיות, להתפלל בחיות ולחיות בשמחה' },
  { en: 'May you be a lamp that lights up everyone around you', he: 'שתהיה נר להאיר את כל הסובבים אותך' },
  { en: 'A shnas hatzlocha, in gashmiyus and in ruchniyus', he: 'שנת הצלחה, בגשמיות וברוחניות' },
  { en: 'May you always be healthy, happy and close to Hashem', he: 'שתהיה תמיד בריא, שמח וקרוב להשם יתברך' },
  { en: 'May the new year of your life be filled with orah, simcha and brocho', he: 'שתהיה שנת חייך החדשה מלאה אורה, שמחה וברכה' },
  { en: 'May you grow in hiskashrus, in ahavas Yisroel and in every good thing', he: 'שתוסיף בהתקשרות, באהבת ישראל ובכל מילי דמיטב' },
  { en: 'May the zechus of your Torah protect you and your whole family', he: 'זכות התורה תגן עליך ועל כל בני משפחתך' },
  { en: 'Be a source of nachas to your family, your yeshiva and all of Klal Yisroel', he: 'שתהיה מקור של נחת למשפחתך, לישיבה ולכלל ישראל' },
  { en: 'May you lern with geshmak and remember everything you lern', he: 'שתלמד בטעם ותזכור את כל תלמודך' },
  { en: 'On your birthday your mazal shines: may it carry you all year', he: 'ביום הולדתו מזלו גובר: שיאיר לך כל השנה' },
  { en: 'Like a tree planted by streams of water: may you always grow and give fruit', he: 'כעץ שתול על פלגי מים: שתצמח ותעשה פרי תמיד' },
  { en: 'May every day of this year be higher than the day before', he: 'שכל יום בשנה הזאת יהיה למעלה מקודמו' },
  { en: 'May Hashem bless you with everything good, in a way you can see', he: 'השם יתברך יברך אותך בכל טוב, בטוב הנראה והנגלה' },
  { en: 'May your lernen lead to good deeds, and your good deeds to simcha', he: 'שהלימוד יביא לידי מעשה, והמעשה לידי שמחה' },
  { en: 'Hatzlocha in your shlichus: wherever you go, may you bring light', he: 'הצלחה בשליחותך: בכל אשר תלך, תביא אור' },
  { en: 'May you merit arichus yomim, good health and a heart full of simcha', he: 'שתזכה לאריכות ימים ושנים טובות, לבריאות ולב מלא שמחה' },
  { en: 'Be strong in Torah, strong in Yiras Shomayim, strong in middos', he: 'חזק בתורה, חזק ביראת שמים, חזק במידות' },
  { en: 'May your today always stand higher than your yesterday', he: 'שיהיה היום שלך תמיד למעלה מן האתמול' },
  { en: 'May you be a true friend, a true chossid and a real mentsch', he: 'שתהיה חבר טוב, חסיד אמיתי ובעל מידות טובות' },
  { en: 'Brocho and hatzlocha in all your ways, now and always', he: 'ברכה והצלחה בכל דרכיך, מעתה ועד עולם' },
  { en: 'May your neshomo shine in everything you do', he: 'שתאיר נשמתך בכל מעשיך' },
  { en: 'A year of new hachlotos tovos, kept with simcha and with strength', he: 'שנה של החלטות טובות חדשות, בשמחה ובתוקף' },
  { en: 'Ivdu es Hashem b\u2019simcha: may you always serve Hashem with joy', he: 'עבדו את השם בשמחה: שתעבוד את השם תמיד מתוך שמחה' },
  { en: 'Add in Torah, in tefillah and in tzedokah, and may it all come easily', he: 'להוסיף בתורה, בתפילה ובצדקה, ושיהיה הכל בנקל' },
  { en: 'May the light of Chassidus fill your mind and warm your heart', he: 'שאור החסידות ימלא את מוחך ויחמם את לבך' },
  { en: 'May you see only good and do only good, all the days of your life', he: 'שתראה רק טוב ותעשה רק טוב כל ימי חייך' },
  { en: 'May Hashem give you your heart\u2019s desire and fulfil all your plans for good', he: 'יתן לך כלבבך וכל עצתך ימלא לטובה' },
  { en: 'May you grow to Torah, to chuppah and to maasim tovim', he: 'שתגדל לתורה, לחופה ולמעשים טובים' },
  { en: 'Bring others close to Torah, and shine like the stars forever', he: 'ומצדיקי הרבים ככוכבים לעולם ועד' },
  { en: 'A good and sweet year, with health, hatzlocha and real yiddishe nachas', he: 'שנה טובה ומתוקה, בבריאות, בהצלחה ובנחת יהודי אמיתי' },
  { en: 'May today\u2019s simcha go with you through the whole year', he: 'שהשמחה של היום תלווה אותך כל השנה' },
  { en: 'May you be a chossid, a mekushar and a lamp of Torah wherever you are', he: 'שתהיה חסיד, מקושר ונר של תורה בכל מקום שתהיה' },
  { en: 'May you merit to see the coming of Moshiach, very soon, together with all of us', he: 'שנזכה כולנו יחד לביאת משיח צדקנו, בקרוב ממש' },
  { en: 'Grow in Torah like your years: every year more, every year deeper', he: 'שתוסיף בתורה כמספר שנותיך: כל שנה יותר, כל שנה עמוק יותר' },
  { en: 'May your heart stay warm, your mind stay sharp and your simcha never end', he: 'שיהיה לבך חם, מוחך חד ושמחתך בלי סוף' },
]);

function dayNum(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? Math.floor(Date.UTC(y, m - 1, d) / 86400000) : 0;
}

/** A fixed shuffle of the blessings (same on every screen, every build). */
const ORDER = (() => {
  const idx = BLESSINGS.map((_, i) => i);
  let a = 0x2f6b9d1;
  const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; };
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
})();

export function pickBlessing(dateISO) {
  const n = BLESSINGS.length;
  return BLESSINGS[ORDER[((dayNum(dateISO) % n) + n) % n]];
}

/** The line above the brocho: speaks to the birthday boy(s) directly. */
export const BROCHO_KICKER = (n) => (n > 1 ? 'Our brocho to all of you' : 'Our brocho to you');

/** The small tag under a name when the birthday is not today: a Shabbos birthday shows Thursday and Sunday. */
export function tagFor(kind) {
  if (kind === 'early') return 'Birthday is this Shabbos';
  if (kind === 'late') return 'Birthday was Shabbos';
  return '';
}

/** "Yesterday: Dovid L., Yossi K." / "Tomorrow: A B · Thursday: C D" for the small strips; at most `max` names, then "+N more". */
export function stripText(items, names = 'full', max = 4) {
  const groups = [];
  for (const it of items || []) {
    const g = groups.find((x) => x.label === it.label);
    if (g) g.names.push(displayName(it.person, names)); else groups.push({ label: it.label, names: [displayName(it.person, names)] });
  }
  let left = max;
  const parts = [];
  for (const g of groups) {
    if (left <= 0) break;
    const shown = g.names.slice(0, left);
    left -= shown.length;
    parts.push(`${g.label}: ${shown.join(', ')}`);
  }
  const total = groups.reduce((n, g) => n + g.names.length, 0);
  const text = parts.join('  ·  ');
  return total > max ? `${text}  +${total - max} more` : text;
}

/** The rail card: English first, Hebrew line second (like every side note). */
export function railNote(today, names = 'full') {
  if (!today?.length) return null;
  const list = today.map((t) => displayName(t.person, names));
  const shown = list.slice(0, 3).join(', ');
  const more = list.length > 3 ? ` +${list.length - 3}` : '';
  return { id: 'birthdays-today', textEn: `Birthday today: ${shown}${more}`, textHe: HERO_HE };
}
