/**
 * Sample content for every style x layout, copied from the designer's mockup
 * (docs/design/2026-10-14-takeovers-r3/takeovers.html: GENERIC, STRESS, SAMPLES)
 * and converted to announcement items by toItem(). Used by the composer's style
 * thumbnails (empty form) and the takeover audit (scripts/takeover-audit.mjs).
 * STRESS[layout].s / .m / .l = one word / typical / at the composer limits.
 */
export const GENERIC = {
  bigwords: { he: 'מזל טוב!', en: 'Mazel Tov to the Cohen family on the birth of a baby boy' },
  event:    { he: 'התוועדות', en: 'Farbrengen', when: ['Tonight', 'הערב'], time: ['9:30', 'PM'], place: { en: 'In the zal', en2: 'after Maariv', he: 'בזאל, אחרי מעריב' } },
  list:     { hd: ['This week', 'השבוע'], items: [['Tonight', 'Farbrengen in the zal', 'התוועדות בזאל', '9:30 PM', 1], ['Wednesday', 'Siyum on Maseches Brachos', 'סיום מסכת ברכות', '8:00 PM'], ['Thursday', 'Mivtza Tefillin on Lincoln Road', 'מבצע תפילין', '2:00 PM'], ['Friday', 'Early Mincha', 'מנחה מוקדמת', '5:40 PM']] },
  quick:    { name: ['Mincha', 'מנחה'], times: [['1:45', 'PM']], where: ['In the zal', 'בזאל'] },
  quote:    { he: 'מעט מן האור דוחה הרבה מן החושך', en: 'A little light dispels a great deal of darkness.', attr: ['Tanya, chapter 12', 'תניא, פרק י״ב'] },
  sicha:    { title: ['From a Sicha of Parshas Noach', 'מתוך שיחת ש״פ נח'], source: 'Likkutei Sichos, vol. 5, p. 23 (placeholder text)',
    body: `The Torah tells Noach, “Come into the teivah, you and all your household.” The Baal Shem Tov taught that teivah means not only an ark but also a word. When the floodwaters of daily life rise — the worry of making a living, the noise and distraction of the world — a person is told: come into the word. Enter the words of Torah and the words of tefillah, and bring your whole household with you.|Inside the teivah the flood cannot reach you. More than that: the very waters that threatened to drown lift the ark higher, above the mountains. So too, the challenges of the world, met from within the words of Torah and prayer, do not diminish a Jew; they raise him up. And the teivah had a tzohar, a window of light, for even inside the ark one must shine outward, so that when the waters recede the world is ready to be rebuilt.` },
  letter:   { top: 'ב״ה<br>ט״ו מרחשון, ה׳תשט״ז · ברוקלין, נ.י.', sal: 'שלום וברכה!', close: 'בברכה להצלחה ולבשורות טובות', source: ['Igros Kodesh (placeholder text)', 'אגרות קודש'],
    body: `במענה על מכתבו, בו כותב אודות הלימוד בישיבה והקשיים שנתקל בהם. והנה ידוע פתגם רבותינו נשיאינו, אשר מעט מן האור דוחה הרבה מן החושך, ועל אחת כמה וכמה אורה של תורה ומצוותיה. ולכן אין להתפעל מן הקשיים, כי אם להוסיף בלימוד בשקידה ובהתמדה, ובפרט בלימוד תורת החסידות, ולעשות כל זה מתוך שמחה וטוב לבב. ויהי רצון שיבשר טוב בכל האמור, ושתהיה לו הצלחה רבה בלימודיו, ויהיה דוגמא חיה לחבריו בכל עניני תורה ויראת שמים.` },
};
/* stress content: len = s (one word / minimal) · m (typical) · l (at the composer limits: He ~40 chars, En ~95 chars, 2 lines, 6 list items) */
const LONGBODY = GENERIC.sicha.body + '|' + 'The Rebbe explained that this is why every Jew, wherever he is, can bring light into the world: not by waiting for a better moment, but by using the very moment he is in. A single act of kindness, a single page learned with joy, changes the entire space around it.|Let us each take one new resolution this week, in learning, in davening, or in how we treat the person sitting next to us.';
export const STRESS = {
  bigwords: { s: { he: 'שבת', en: 'Shabbos' },
    m: GENERIC.bigwords,
    l: { he: 'מזל טוב לכבוד חתונתו של הרב מנדל כהן', en: 'Mazel Tov to Rabbi Mendel Cohen and family on the engagement of their son Yossi to Chaya Mushka', sub: ['Reception Thursday night at 8:00 PM in the main dining room, all bochurim welcome', 'הכנסת כלה בליל חמישי בחדר האוכל'] } },
  event: { s: { he: 'שיעור', en: 'Shiur', when: ['Today', 'היום'], time: ['1:00', 'PM'] },
    m: GENERIC.event,
    l: { he: 'אסיפת הורים שנתית לכבוד פתיחת שנת הלימודים', en: 'Annual Parent–Teacher Evening and Open House for the New School Year', when: ['Wednesday', 'יום רביעי'], time: ['11:45', 'PM'], place: { en: 'In the main dining room, second floor', en2: 'Light refreshments and childcare provided', he: 'בחדר האוכל הגדול, קומה שנייה' } } },
  list: { s: { hd: ['Today', 'היום'], items: [['Tonight', 'Farbrengen', 'התוועדות', '9:30 PM', 1], ['Friday', 'Mincha', 'מנחה', '5:40 PM']] },
    m: GENERIC.list,
    l: { hd: ['Upcoming events at the yeshiva this month', 'אירועים קרובים בישיבה החודש'], items: [
      ['Tonight', 'Farbrengen in the zal with Rabbi Levin', 'התוועדות בזאל עם הרב לוין', '9:30 PM', 1], ['Wednesday', 'Siyum on Maseches Brachos and seudas mitzvah', 'סיום מסכת ברכות וסעודת מצוה', '8:00 PM'],
      ['Thursday', 'Mivtza Tefillin on Lincoln Road, buses leave from Lot B', 'מבצע תפילין בליינקולן רוד', '2:00 PM'], ['Friday', 'Early Mincha and Kabbalas Shabbos', 'מנחה מוקדמת וקבלת שבת', '5:40 PM'],
      ['Sunday', 'Parent–Teacher evening in the main hall', 'אסיפת הורים באולם הגדול', '7:30 PM'], ['Monday', 'Trip to the Everglades, bring water', 'טיול לאוורגליידס', '8:15 AM']] } },
  quick: { s: { name: ['Mincha', 'מנחה'], times: [['1:45', 'PM']] },
    m: GENERIC.quick,
    l: { name: ['Rabbi Levin’s Chassidus Shiur', 'שיעור חסידות עם הרב לוין'], times: [['10:45', 'AM', 'Starts', 'מתחיל'], ['12:15', 'PM', 'Ends', 'מסתיים']], where: ['In the Beis Medrash on the second floor, near the library', 'בבית המדרש בקומה השנייה, ליד הספרייה'] } },
  quote: { s: { he: 'שמח', en: 'Be happy', attr: ['Tanya', 'תניא'] },
    m: GENERIC.quote,
    l: { he: 'תכלית הבריאה היא שיעשה הקב״ה דירה בתחתונים, ועל ידי עבודת האדם נעשה העולם כולו דירה לו', en: 'The purpose of creation is that G-d make for Himself a dwelling in the lowest realms; through a person’s service the whole world becomes His home.', attr: ['Tanya, chapter 36, as explained in the Rebbe’s sichos', 'תניא, פרק לו'] } },
  sicha: { s: { ...GENERIC.sicha, body: 'Come into the teivah, you and all your household.' }, m: GENERIC.sicha, l: { ...GENERIC.sicha, body: LONGBODY } },
  letter: { s: { ...GENERIC.letter, body: 'במענה על מכתבו. יבשר טוב.' }, m: GENERIC.letter, l: { ...GENERIC.letter, body: GENERIC.letter.body + ' ' + GENERIC.letter.body } },
};
export const SAMPLES = {
  classic:     { event: { he: 'אסיפת הורים', en: 'Parent–Teacher Evening', when: ['Thursday', 'יום חמישי'], time: ['7:30', 'PM'], place: { en: 'In the main hall', en2: 'Light refreshments', he: 'באולם הגדול' } } },
  grand:       { event: { he: 'הדינער השנתי', en: 'Annual Yeshiva Dinner', when: ['Sunday', 'יום ראשון'], time: ['6:30', 'PM'], place: { en: 'The Grand Ballroom', en2: 'Reception from 6:00', he: 'באולם הנשפים' } } },
  emergency:   { bigwords: { he: 'תרגיל אש', en: 'Fire drill — exit by the side doors', sub: ['Walk, don’t run. Meet your shiur in Lot B.', 'יוצאים בנחת · נפגשים במגרש B'] } },
  sleek:       { quick: { name: ['Mincha', 'מנחה'], times: [['1:45', 'PM']], where: ['In the zal', 'בזאל'] } },
  celebration: { bigwords: { he: 'מזל טוב!', en: 'Mazel Tov to Mendel Cohen on his engagement!', sub: ['to Chaya Mushka Levin of Crown Heights', 'לרגל אירוסיו'] },
                 event: { he: 'שבע ברכות', en: 'Sheva Brachos for Mendel & Chaya Mushka', when: ['Tonight', 'הערב'], time: ['8:00', 'PM'], place: { en: 'In the dining room', en2: 'All bochurim welcome', he: 'בחדר האוכל' } },
                 list: { hd: ['Simchas this week', 'שמחות השבוע'], items: [['Tonight', 'L’chaim — Mendel Cohen', 'לחיים', '9:30 PM', 1], ['Wednesday', 'Sheva Brachos in the dining room', 'שבע ברכות', '8:00 PM'], ['Thursday', 'Bar Mitzvah — Yossi Gordon', 'בר מצוה', '7:00 PM'], ['Sunday', 'Upsherin — the Kaplan family', 'חלאקה', '11:00 AM']] } },
  urgent:      { event: { kick: ['Important', 'חשוב'], he: 'יציאה מוקדמת היום', en: 'Early dismissal — storm warning', when: ['Today', 'היום'], time: ['2:00', 'PM'], place: { en: 'Buses wait in Lot B', en2: 'Leave seforim in the zal', he: 'האוטובוסים במגרש B' } } },
  torah:       { quote: GENERIC.quote },
  trip:        { event: { he: 'טיול לאוורגליידס', en: 'Everglades Trip', when: ['Tomorrow', 'מחר'], time: ['8:15', 'AM'], place: { en: 'Bus leaves from Lot B', en2: 'Bring water and a hat', he: 'האוטובוס יוצא ממגרש B' } },
                 bigwords: { he: 'יוצאים לדרך!', en: 'Bus leaves 8:15 AM — Lot B', sub: ['Everglades trip · bring water and a hat', ''] },
                 list: { hd: ['Trip day', 'יום הטיול'], items: [['Lot B', 'Board the buses', 'עולים לאוטובוסים', '8:15 AM', 1], ['Shark Valley', 'Tram tour, then Shacharis', 'סיור ושחרית', '10:00 AM'], ['Everglades City', 'Lunch and Mincha', 'ארוחה ומנחה', '1:30 PM'], ['Yeshiva', 'Back for Maariv', 'חזרה לישיבה', '6:30 PM']] } },
  phone:       { quick: { name: ['Phones away', 'טלפונים בצד'], pre: 'by', times: [['9:00', 'AM']], where: ['Hand them in at the office door', 'מוסרים בדלת המשרד'] },
                 event: { he: 'טלפונים בצד', en: 'Phones away', when: ['Today', 'היום'], time: ['9:00', 'AM'], place: { en: 'Hand them in at the office', he: 'מוסרים במשרד' } } },
  memorial:    { bigwords: { kick: ['', 'לעילוי נשמת'], he: 'ר׳ יוסף ב״ר אברהם ז״ל', en: 'Yahrzeit of Reb Yosef ben Avraham', sub: ['15 Cheshvan · Mishnayos after Mincha', 'ת.נ.צ.ב.ה.'] },
                 quote: { he: 'וְהַחַי יִתֵּן אֶל לִבּוֹ', en: 'And the living shall take it to heart.', attr: ['Koheles 7:2', 'קהלת ז, ב'] } },
  hype:        { quick: { name: ['Winter Shabbaton', 'שבתון חורף'], big: ['3', 'days to go'], where: ['Parshas Lech Lecha · sign up in the office', 'הרשמה במשרד'] } },
  shabbos:     { quick: { name: ['Gut Shabbos', 'גוט שבת'], times: [['6:28', 'PM', 'Candle lighting', 'הדלקת נרות'], ['7:21', 'PM', 'Havdalah', 'הבדלה']], where: ['Parshas Noach', 'פרשת נח'] },
                 quote: { he: 'זָכוֹר אֶת יוֹם הַשַּׁבָּת לְקַדְּשׁוֹ', en: 'Remember the Shabbos day, to keep it holy.', attr: ['Shemos 20:8', 'שמות כ, ח'] } },
  yomtov:      { event: { kick: ['Chag Sameach', 'חג שמח'], he: 'הקפות שמחת תורה', en: 'Simchas Torah Hakafos', when: ['Tonight', 'הערב'], time: ['7:45', 'PM'], place: { en: 'In the zal', en2: 'Kiddush to follow', he: 'בזאל' } } },
  siyum:       { event: { he: 'הדרן עלך מסכת ברכות', en: 'Siyum on Maseches Brachos', when: ['Wednesday', 'יום רביעי'], time: ['8:00', 'PM'], place: { en: 'In the zal', en2: 'Seudas mitzvah to follow', he: 'סעודת מצוה אחרי הסיום' } },
                 bigwords: { he: 'הדרן עלך', en: 'Mazel Tov to Shiur Beis on completing Maseches Brachos', sub: ['Siyum Wednesday 8:00 PM in the zal', ''] },
                 list: { hd: ['Siyumim this month', 'סיומים החודש'], items: [['Wednesday', 'Maseches Brachos — Shiur Beis', 'מסכת ברכות', '8:00 PM', 1], ['Thursday', 'Sefer HaTanya — Night Seder', 'ספר התניא', '9:15 PM'], ['Sunday', 'Mishnayos Shabbos — Shiur Alef', 'משניות שבת', '7:30 PM']] } },
  farbrengen:  { event: { he: 'התוועדות', en: 'Farbrengen with Rabbi Levin', when: ['Tonight', 'הערב'], time: ['9:30', 'PM'], place: { en: 'In the zal', en2: 'after Maariv', he: 'בזאל, אחרי מעריב' } } },
  mivtzoim:    { list: { hd: ['Mivtzoim this Sunday', 'מבצעים'], nod: true, items: [['', 'Mitzvah Tank leaves from Lot B', 'טנק המצוות יוצא', '1:00 PM', 1], ['', 'Tefillin on Lincoln Road', 'מבצע תפילין', '1:30 PM'], ['', 'Shabbos candles at Aventura Mall', 'נרות שבת קודש', '3:00 PM'], ['', 'Back for Mincha', 'חזרה למנחה', '5:30 PM']] } },
  welcome:     { bigwords: { he: 'ברוכים הבאים', en: 'Welcome, parents of Shiur Gimmel', sub: ['Open shiur in the zal · Kiddush at 12:30', ''] } },
  simcha:      { bigwords: { he: 'יום הולדת שמח', en: 'Happy birthday, Levi Shapiro!', sub: ['A year of growth in Torah and Chassidus', 'שנת הצלחה'] } },
  schedule:    { quick: { kick: ['Today only', 'היום בלבד'], name: ['Mincha', 'מנחה'], times: [['2:15', 'PM']], was: '1:45 PM', where: ['In the zal', 'בזאל'] } },
  quiet:       { bigwords: { he: 'שקט, בבקשה', en: 'Quiet please — farher in the zal until 11:30' } },
  chanukah:    { event: { he: 'הדלקת נר חנוכה', en: 'Public Menorah Lighting', when: ['Tonight', 'הערב'], time: ['5:45', 'PM'], place: { en: 'Lincoln Road', en2: 'Bring a friend', he: 'בלינקולן רוד' } } },
  purim:       { event: { he: 'קריאת המגילה', en: 'Megillah Reading', when: ['Tonight', 'הערב'], time: ['7:15', 'PM'], place: { en: 'In the zal', en2: 'Mishloach manos table in the lobby', he: 'בזאל' } },
                 bigwords: { he: 'פורים שמח!', en: 'Purim Sameach! Megillah tonight at 7:15 PM', sub: ['Mishloach manos table in the lobby', 'משלוח מנות בלובי'] } },
  pesach:      { bigwords: { he: 'חג כשר ושמח', en: 'Wishing everyone a kosher and joyous Pesach', sub: ['Seder tonight · Maariv at 6:50 PM', 'ליל הסדר הערב'] } },
  roshchodesh: { bigwords: { he: 'ראש חודש כסלו', en: 'Rosh Chodesh Kislev', sub: ['Hallel after Shacharis · Yaaleh V’yavo', 'הלל אחרי שחרית'] } },
  lagbaomer:   { event: { he: 'מדורת ל״ג בעומר', en: 'Lag BaOmer Bonfire', when: ['Sunday', 'יום ראשון'], time: ['8:00', 'PM'], place: { en: 'On the field behind the zal', en2: 'Bring a friend', he: 'בשדה מאחורי הזאל' } } },
  chassidic:   { bigwords: { he: 'י״ט כסלו', en: 'Yud-Tes Kislev — Rosh Hashanah of Chassidus', sub: ['Farbrengen tonight at 9:30 PM in the zal', 'התוועדות הערב'] } },
};


export const STYLES = "classic grand emergency sleek celebration urgent torah trip phone memorial hype shabbos yomtov siyum farbrengen mivtzoim welcome simcha schedule quiet chanukah purim pesach roshchodesh lagbaomer chassidic".split(' ');
export const LAYOUTS = ['bigwords', 'event', 'list', 'quick', 'quote', 'sicha', 'letter'];

const to24 = (t, ap) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t); if (!m) return '';
  let h = +m[1] % 12; if (/^p/i.test(ap || '')) h += 12; return `${String(h).padStart(2, '0')}:${m[2]}`;
};
const to24s = (s) => { if (!s) return ''; const [t, ap] = s.split(' '); return to24(t, ap); };

/** mockup content model m -> announcement item (look.layout 'quick' -> 'quicktime'). */
export function toItem(style, layout, m, extra = {}) {
  const c = {};
  let lay = layout;
  if (layout === 'bigwords') {
    c.headlineHe = m.he; c.headlineEn = m.en;
    if (m.sub) { c.bodyEn = m.sub[0]; c.bodyHe = m.sub[1]; }
    if (m.kick) { c.target = m.kick[0]; c.targetHe = m.kick[1]; }
  } else if (layout === 'event') {
    c.event = { title: m.en, titleHe: m.he, day: m.when ? m.when[0] : '', dayHe: m.when ? m.when[1] : '', time: m.time ? to24(m.time[0], m.time[1]) : '',
      place: m.place ? m.place.en : '', place2: m.place ? m.place.en2 || '' : '', placeHe: m.place ? m.place.he || '' : '' };
    if (m.kick) { c.target = m.kick[0]; c.targetHe = m.kick[1]; }
  } else if (layout === 'list') {
    c.list = { heading: m.hd[0], headingHe: m.hd[1], items: m.items.map(([d, en, he, t]) => ({ text: en, textHe: he, day: d, time: to24s(t) })) };
  } else if (layout === 'quick') {
    lay = 'quicktime';
    const q = { name: m.name[0], nameHe: m.name[1], pre: m.pre || '', place: m.where ? m.where[0] : '', placeHe: m.where ? m.where[1] : '' };
    if (m.big) { q.big = m.big[0]; q.bigLabel = m.big[1]; }
    if (m.times) {
      q.time = to24(m.times[0][0], m.times[0][1]); q.label = m.times[0][2] || ''; q.labelHe = m.times[0][3] || '';
      if (m.times[1]) { q.time2 = to24(m.times[1][0], m.times[1][1]); q.label2 = m.times[1][2] || ''; q.label2He = m.times[1][3] || ''; }
    }
    if (m.was) q.was = to24s(m.was);
    c.quicktime = q;
    if (m.kick) { c.target = m.kick[0]; c.targetHe = m.kick[1]; }
  } else if (layout === 'quote') {
    c.quote = { text: m.en, textHe: m.he, source: m.attr[0], sourceHe: m.attr[1] };
  } else if (layout === 'sicha') {
    c.sicha = { title: m.title[0], titleHe: m.title[1], body: m.body.split('|').join('\n'), source: m.source };
  } else if (layout === 'letter') {
    const lines = m.top.split('<br>');
    const dl = (lines[1] || '').split(' \u00B7 ');
    c.letter = { dateHe: dl[0], date: dl[1] || '', salutation: m.sal, body: m.body, signature: m.close, source: m.source[0], sourceHe: m.source[1] };
  }
  return {
    id: `t-${style}-${layout}`, status: 'published', display: 'takeover', enabled: true, hold: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    content: c, look: { layout: lay, style, animation: 'full', fit: 'auto', ...(extra.look || {}) },
    slide: { duration: 12, label: '' }, takeover: { group: null, rotateSec: 10 }, when: { startsAt: null, expiresAt: null, recurrence: null },
  };
}

/** The mockup's content for a style x layout (sample, or the generic one); len = 's' | 'm' | 'l' stress text. */
export function sampleFor(style, layout, len = null) {
  if (len && STRESS[layout]) return STRESS[layout][len];
  return (SAMPLES[style] || {})[layout] || GENERIC[layout];
}
