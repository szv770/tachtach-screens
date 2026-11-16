/**
 * A LOCAL FIXTURE for the Spotlight graphics (dev preview + audit only, never imported by the kiosk app): one spotlight
 * (Hey Teves, 40 years since Didan Notzach) at every stage, in the view-model shape of model.js. When the pure rules land
 * (src/shared/spotlight.js), the slide wiring builds the same shape from them; this file stays for the preview.
 */
import { DAY, HOUR, MIN } from './model.js';

export const STAGE_OFFSETS = Object.freeze({
  announce: 41 * DAY + 6 * HOUR + 12 * MIN + 30000,
  month: 22 * DAY + 3 * HOUR + 47 * MIN + 12000,
  twoWeeks: 11 * DAY + 9 * HOUR + 5 * MIN + 41000,
  week: 5 * DAY + 2 * HOUR + 31 * MIN + 8000,
  eve: 9 * HOUR + 12 * MIN + 45000,
  lastHour: 38 * MIN + 20000,
  day: -3 * HOUR,
});
export const STAGE_HEAT = Object.freeze({ announce: 0, month: 0.2, twoWeeks: 0.35, week: 0.5, eve: 0.75, lastHour: 0.9, day: 1 });
export const STAGES = Object.keys(STAGE_OFFSETS);

// a stand-in photo (fixture content, not a component colour): an SVG landscape with a light sky, a dark hill
const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb3d9"/><stop offset="1" stop-color="#f1d9b0"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6b4a"/><stop offset="1" stop-color="#2c3324"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#s)"/><circle cx="880" cy="250" r="90" fill="#fff4d6"/>
<path d="M0 560 Q300 420 600 520 T1200 470 V800 H0 Z" fill="url(#g)"/>
<rect x="380" y="380" width="300" height="220" fill="#7a3b2a"/><path d="M360 390 L530 280 L700 390 Z" fill="#4b2419"/>
<rect x="500" y="480" width="60" height="120" fill="#2b140e"/><rect x="420" y="420" width="50" height="50" fill="#f6e2a7"/><rect x="590" y="420" width="50" height="50" fill="#f6e2a7"/></svg>`)}`;

const LONG_STORY_EN = 'On the fifth of Teves 5747 the federal court in New York ruled that the library of the Previous Rebbe belongs to Agudas Chassidei Chabad, and not to any one person. The Rebbe asked that the day be celebrated with joy, and that every Jew should add in buying and learning seforim. Since then, Chassidim mark the day by buying new seforim, learning them, and farbrenging about the meaning of the victory: that the Rebbe, and his teachings, belong to all the Chassidim and to the whole Jewish people. '.repeat(2).trim();

export function fixtureModel({ stage = 'month', nowMs = Date.now(), lang = 'both', tier = 'major', photo = true, long = false, accent = '' } = {}) {
  const startMs = nowMs + STAGE_OFFSETS[stage];
  const days = stage === 'day' ? 0 : Math.max(0, Math.round((startOfDay(startMs + 6 * HOUR) - startOfDay(nowMs)) / DAY));
  const years = tier === 'none' ? null : tier === 'major'
    ? { tier: 'major', n: 40, letters: 'מ׳', completed: 40, entering: 41, focus: 'completed', what: { en: 'Didan Notzach', he: 'דידן נצח' },
      vort: { en: 'Forty years: "a person does not stand on his teacher\'s mind until forty years", when the heart is given to know.', he: 'ארבעים שנה: "לא קאי איניש אדעתיה דרביה עד ארבעין שנין".', source: 'Avodah Zarah 5b · Rashi on Devarim 29:3' } }
    : { tier: 'notable', n: 39, letters: 'ל״ט', completed: 39, entering: 40, focus: 'entering', what: { en: 'Didan Notzach', he: 'דידן נצח' }, vort: null };
  return {
    key: 'hey-teves-5787',
    name: long ? { en: 'Hey Teves, the Day of the Victory of the Seforim (Didan Notzach)', he: 'ה׳ טבת, יום הניצחון של הספרים - דידן נצח' } : { en: 'Hey Teves', he: 'ה׳ טבת' },
    lang, stage, heat: STAGE_HEAT[stage], startMs, endMs: startMs + 25 * HOUR, leadStartMs: startMs - 60 * DAY, days, accent,
    begins: { en: stage === 'day' ? 'Until tomorrow at nightfall' : 'Begins Monday evening · Shkia 4:32 PM', he: 'מתחיל ביום שני בערב · שקיעה 4:32' },
    facts: [
      { label: { en: 'Hebrew date', he: 'תאריך עברי' }, value: { en: '5 Teves 5787', he: 'ה׳ טבת תשפ״ז' } },
      { label: { en: 'The day', he: 'היום' }, value: { en: 'Tuesday, Dec 15', he: 'יום שלישי' } },
      { label: { en: 'Since', he: 'מאז' }, value: { en: '5747', he: 'תשמ״ז' } },
      { label: { en: 'Begins', he: 'מתחיל' }, value: { en: 'Mon evening', he: 'שני בערב' } },
    ],
    years,
    happened: { en: 'The court ruled that the Rebbe\'s library belongs to Chabad: the seforim came home.', he: 'בית המשפט פסק שהספרייה שייכת לחב״ד: הספרים חזרו הביתה.', source: 'Sefer HaToldos, vol. 4' },
    story: { en: long ? LONG_STORY_EN : LONG_STORY_EN.slice(0, 420), he: 'בה׳ טבת תשמ״ז פסק בית המשפט הפדרלי בניו יורק שספריית הרבי הקודם שייכת לאגודת חסידי חב״ד. הרבי ביקש לחגוג את היום בשמחה ולהוסיף בקניית ספרים ובלימודם.', source: 'Kfar Chabad Magazine' },
    vort: { en: 'A sefer is not a book on a shelf: it is a living teacher. When we buy a new sefer, we invite a teacher into our home.', he: 'ספר אינו חפץ על המדף: הוא מורה חי.', source: 'Sichos Kodesh 5747' },
    history: [
      { year: 5745, en: 'The seforim are taken from the library at 770.', he: 'הספרים נלקחים מהספרייה ב-770.' },
      { year: 5746, en: 'Agudas Chassidei Chabad goes to court.', he: 'אגודת חסידי חב״ד פונה לבית המשפט.' },
      { year: 5747, en: 'Judge Sifton rules for Agudas Chassidei Chabad: Didan Notzach.', he: 'השופט סיפטון פוסק לטובת אגודת חסידי חב״ד: דידן נצח.' },
      { year: 5748, en: 'The appeal is rejected; the seforim stay at 770.', he: 'הערעור נדחה; הספרים נשארים ב-770.' },
      { year: 5750, en: 'The Rebbe calls for a sefer in every home, a library in every house.', he: 'הרבי קורא לספרייה בכל בית.' },
    ],
    photo: photo ? { src: PHOTO, dim: 0.1 } : null,
    advent: { en: 'Buy one new sefer this week, and learn a page of it.', he: 'לקנות ספר חדש השבוע וללמוד בו דף.' },
    strip: [
      { key: 'yud-shvat', name: { en: 'Yud Shvat', he: 'י׳ שבט' }, days: days + 36 },
      { key: 'purim', name: { en: 'Purim', he: 'פורים' }, days: days + 84 },
      { key: 'pesach', name: { en: 'Pesach', he: 'פסח' }, days: days + 113 },
    ],
  };
}
function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
