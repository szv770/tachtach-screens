export const RSS_MAP = {
  "Dawn (Alot Hashachar)": "alotHaShachar",
  "Earliest Tallit and Tefillin (Misheyakir)": "misheyakir",
  "Sunrise (Hanetz Hachamah)": "sunrise",
  "Latest Shema": "sofZmanShma",
  "Latest Shacharit": "sofZmanTfilla",
  "Midday (Chatzot Hayom)": "chatzot",
  "Earliest Mincha (Mincha Gedolah)": "minchaGedola",
  'Mincha Ketanah ("Small Mincha")': "minchaKetana",
  'Plag Hamincha ("Half of Mincha")': "plagHaMincha",
  "Sunset (Shkiah)": "sunset",
  "Nightfall (Tzeit Hakochavim)": "tzeit7083deg",
  // Additional zmanim
  "Midnight (Chatzot Layla)": "chatzotLayla",
  "Chatzot Layla (Halachic Midnight)": "chatzotLayla",
  "Shaah Zmanit (Halachic Hour)": "shaaZmanit",
  "Halachic Hour (Shaah Zmanit)": "shaaZmanit",
};

export const ZMANIM_DISPLAY = [
  { k: "alotHaShachar", he: "עלות השחר", en: "Alot HaShachar" },
  { k: "misheyakir", he: "משיכיר", en: "Misheyakir" },
  { k: "sunrise", he: "הנץ החמה", en: "HaNetz HaChama" },
  { k: "sofZmanShma", he: 'ס"ז קריאת שמע', en: "Latest Shema" },
  { k: "sofZmanTfilla", he: 'ס"ז תפילה', en: "Latest Shacharit" },
  { k: "chatzot", he: "חצות היום", en: "Chatzot HaYom" },
  { k: "minchaGedola", he: "מנחה גדולה", en: "Mincha Gedolah" },
  { k: "minchaKetana", he: "מנחה קטנה", en: "Mincha Ketana" },
  { k: "plagHaMincha", he: "פלג המנחה", en: "Plag HaMincha" },
  { k: "sunset", he: "שקיעה", en: "Shkia" },
  { k: "tzeit7083deg", he: "צאת הכוכבים", en: "Tzeit HaKochavim" },
  { k: "chatzotLayla", he: "חצות לילה", en: "Chatzos Layla" },
  { k: "shaaZmanit", he: 'שעה זמנית', en: "Shaah Zmaniyos" },
];

const HEB_NUM = {
  1:"א",2:"ב",3:"ג",4:"ד",5:"ה",6:"ו",7:"ז",8:"ח",9:"ט",
  10:"י",11:"יא",12:"יב",13:"יג",14:"יד",15:"טו",16:"טז",17:"יז",18:"יח",19:"יט",
  20:"כ",21:"כא",22:"כב",23:"כג",24:"כד",25:"כה",26:"כו",27:"כז",28:"כח",29:"כט",
  30:"ל",31:"לא",32:"לב",33:"לג",34:"לד",35:"לה",36:"לו",37:"לז",38:"לח",39:"לט",
  40:"מ",41:"מא",42:"מב",43:"מג",44:"מד",45:"מה",46:"מו",47:"מז",48:"מח",49:"מט",
  50:"נ",51:"נא",52:"נב",53:"נג",54:"נד",55:"נה",56:"נו",57:"נז",58:"נח",59:"נט",
  60:"ס",61:"סא",62:"סב",63:"סג",64:"סד",65:"סה",66:"סו",67:"סז",68:"סח",69:"סט",
  70:"ע",71:"עא",72:"עב",73:"עג",74:"עד",75:"עה",76:"עו",77:"עז",78:"עח",79:"עט",
  80:"פ",81:"פא",82:"פב",83:"פג",84:"פד",85:"פה",86:"פו",87:"פז",88:"פח",89:"פט",
  90:"צ",91:"צא",92:"צב",93:"צג",94:"צד",95:"צה",96:"צו",97:"צז",98:"צח",99:"צט",
  100:"ק",101:"קא",102:"קב",103:"קג",104:"קד",105:"קה",106:"קו",107:"קז",108:"קח",109:"קט",
  110:"קי",111:"קיא",112:"קיב",113:"קיג",114:"קיד",115:"קטו",116:"קטז",117:"קיז",118:"קיח",119:"קיט",
  120:"קכ",121:"קכא",122:"קכב",123:"קכג",124:"קכד",125:"קכה",126:"קכו",127:"קכז",128:"קכח",129:"קכט",
  130:"קל",131:"קלא",132:"קלב",133:"קלג",134:"קלד",135:"קלה",136:"קלו",137:"קלז",138:"קלח",139:"קלט",
  140:"קמ",141:"קמא",142:"קמב",143:"קמג",144:"קמד",145:"קמה",146:"קמו",147:"קמז",148:"קמח",149:"קמט",
  150:"קנ",
};
export const hNum = n => HEB_NUM[n] ? `${HEB_NUM[n]}׳` : String(n);
export const hebrewNumeral = n => HEB_NUM[n] || String(n);

export const SEFER_HE = {
  "Sefer HaMadda": "ספר המדע",
  "Sefer Ahavah": "ספר אהבה",
  "Sefer Zmanim": "ספר זמנים",
  "Sefer Nashim": "ספר נשים",
  "Sefer Kedushah": "ספר קדושה",
  "Sefer Haflaah": "ספר הפלאה",
  "Sefer Zeraim": "ספר זרעים",
  "Sefer Avodah": "ספר עבודה",
  "Sefer Korbanot": "ספר קרבנות",
  "Sefer Taharah": "ספר טהרה",
  "Sefer Nezikin": "ספר נזיקין",
  "Sefer Kinyan": "ספר קנין",
  "Sefer Mishpatim": "ספר משפטים",
  "Sefer Shoftim": "ספר שופטים",
};
