/**
 * Menu slide wording: ONE table (spec docs/specs/05-MENU.md 2.2), English + Hebrew, so a native speaker fixes a word in
 * one place and an org can later override it. No school, kitchen or person names live here.
 *
 * Tags are advisory (the kitchen is the authority on allergies). A tag is always drawn as a short code AND a word, never
 * colour alone.
 */

/** id, English word, Hebrew word, short code (max 3 letters, shown in the chip), kind. */
export const TAGS = Object.freeze([
  { id: 'meat', en: 'Meat', he: 'בשרי', short: 'MT', kind: 'kosher' },
  { id: 'dairy', en: 'Dairy', he: 'חלבי', short: 'DA', kind: 'kosher' },
  { id: 'parve', en: 'Parve', he: 'פרווה', short: 'PV', kind: 'kosher' },
  { id: 'nuts', en: 'Nuts', he: 'אגוזים', short: 'NT', kind: 'allergen' },
  { id: 'peanuts', en: 'Peanuts', he: 'בוטנים', short: 'PN', kind: 'allergen' },
  { id: 'gluten', en: 'Gluten', he: 'גלוטן', short: 'GL', kind: 'allergen' },
  { id: 'egg', en: 'Egg', he: 'ביצים', short: 'EG', kind: 'allergen' },
  { id: 'fish', en: 'Fish', he: 'דגים', short: 'FS', kind: 'allergen' },
  { id: 'sesame', en: 'Sesame', he: 'שומשום', short: 'SE', kind: 'allergen' },
  { id: 'soy', en: 'Soy', he: 'סויה', short: 'SY', kind: 'allergen' },
  { id: 'vegetarian', en: 'Vegetarian', he: 'צמחוני', short: 'VG', kind: 'diet' },
]);
export const TAG_IDS = Object.freeze(TAGS.map((t) => t.id));
export const DEFAULT_TAGS = Object.freeze(['meat', 'dairy', 'parve', 'nuts', 'gluten', 'egg', 'fish', 'sesame']);
const BY_ID = Object.freeze(Object.fromEntries(TAGS.map((t) => [t.id, t])));
export const tagInfo = (id) => BY_ID[id] || null;

/** Day codes, Sunday first. 'Shabbos' is the Saturday column (the same code the schedule uses). */
export const DAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos']);
export const DAY_EN = Object.freeze({ Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Shabbos: 'Shabbos' });
export const DAY_EN_SHORT = Object.freeze({ Sun: 'Sun', Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Shabbos: 'Shabbos' });
export const DAY_HE = Object.freeze({ Sun: 'יום ראשון', Mon: 'יום שני', Tue: 'יום שלישי', Wed: 'יום רביעי', Thu: 'יום חמישי', Fri: 'יום שישי', Shabbos: 'שבת' });
export const DAY_HE_SHORT = Object.freeze({ Sun: 'א׳', Mon: 'ב׳', Tue: 'ג׳', Wed: 'ד׳', Thu: 'ה׳', Fri: 'ו׳', Shabbos: 'שבת' });

/** Words a person may type for a day (lower case, no punctuation) -> code. Used by the paste parser. */
export const DAY_WORDS = Object.freeze({
  sun: 'Sun', sunday: 'Sun', mon: 'Mon', monday: 'Mon', tue: 'Tue', tues: 'Tue', tuesday: 'Tue', wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu', fri: 'Fri', friday: 'Fri',
  sat: 'Shabbos', saturday: 'Shabbos', shabbos: 'Shabbos', shabbat: 'Shabbos', shabbes: 'Shabbos', shabbosh: 'Shabbos',
  'יום א': 'Sun', 'יום ראשון': 'Sun', 'ראשון': 'Sun', 'יום ב': 'Mon', 'יום שני': 'Mon', 'שני': 'Mon',
  'יום ג': 'Tue', 'יום שלישי': 'Tue', 'שלישי': 'Tue', 'יום ד': 'Wed', 'יום רביעי': 'Wed', 'רביעי': 'Wed',
  'יום ה': 'Thu', 'יום חמישי': 'Thu', 'חמישי': 'Thu', 'יום ו': 'Fri', 'יום שישי': 'Fri', 'שישי': 'Fri',
  'שבת': 'Shabbos', 'יום שבת': 'Shabbos', 'שבת קודש': 'Shabbos',
});

/** The starter meal types written on first save (every name, time and day list is editable; nothing here is a school's own). */
export const STARTER_MEALS = Object.freeze([
  { id: 'breakfast', en: 'Breakfast', he: 'ארוחת בוקר', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], from: '06:00', to: '10:00', time: '7:45', shabbos: false },
  { id: 'lunch', en: 'Lunch', he: 'ארוחת צהריים', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], from: '10:00', to: '15:00', time: '12:30', shabbos: false },
  { id: 'dinner', en: 'Dinner', he: 'ארוחת ערב', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], from: '15:00', to: '21:00', time: '6:00', shabbos: false },
  { id: 'fri-night', en: 'Friday night', he: 'סעודת ליל שבת', days: ['Fri'], from: '18:00', to: '23:59', time: '', shabbos: true },
  { id: 'shabbos-lunch', en: 'Shabbos lunch', he: 'סעודת שבת', days: ['Shabbos'], from: '11:00', to: '16:00', time: '', shabbos: true },
  { id: 'seuda-3', en: 'Seudah Shlishis', he: 'סעודה שלישית', days: ['Shabbos'], from: '16:00', to: '20:00', time: '', shabbos: true },
]);

/** Everything the slide and the admin say, in both languages. */
export const WORDS = Object.freeze({
  today: { en: 'Today’s menu', he: 'תפריט להיום' },
  tomorrow: { en: 'Tomorrow’s menu', he: 'תפריט למחר' },
  later: { en: '{day}’s menu', he: 'תפריט ליום {dayHe}' },
  week: { en: 'This week', he: 'השבוע' },
  nextWeek: { en: 'Next week', he: 'שבוע הבא' },
  closedToday: { en: 'No meals today', he: 'אין ארוחות היום' },
  closed: { en: 'No meals', he: 'אין ארוחות' },
  now: { en: 'Now', he: 'עכשיו' },
  next: { en: 'Next', he: 'הבא' },
  more: { en: '+{n} more', he: '+{n} נוספים' },
  part: { en: '{i} of {n}', he: '{i} מתוך {n}' },
  fullMenu: { en: 'Full menu: see Today’s menu', he: 'התפריט המלא בתפריט להיום' },
  shabbosAhead: { en: 'Shabbos', he: 'שבת' },
  sample: { en: 'Sample menu', he: 'תפריט לדוגמה' },
});

export const fill = (tpl, vars = {}) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

/** Sample dishes (plain generic food) for the admin's empty preview, never real kitchen data. */
export const SAMPLE_MEALS = Object.freeze({
  breakfast: [{ en: 'Oatmeal', he: 'דייסה', tags: ['dairy'] }, { en: 'Fresh fruit', he: 'פירות טריים', tags: ['parve'] }, { en: 'Yogurt', he: 'יוגורט', tags: ['dairy'] }],
  lunch: [{ en: 'Chicken schnitzel', he: 'שניצל עוף', tags: ['meat', 'gluten'] }, { en: 'Rice', he: 'אורז', tags: [] }, { en: 'Green salad', he: 'סלט ירקות', tags: ['parve'] }],
  dinner: [{ en: 'Pasta', he: 'פסטה', tags: ['dairy', 'gluten'] }, { en: 'Garden salad', he: 'סלט גינה', tags: ['parve'] }],
});
