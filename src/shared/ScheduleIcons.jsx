import React from 'react';

const defaultProps = {
  size: 20,
  color: 'currentColor',
};

function svgBase(size, color, children) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

/** Open book -- study/learning */
export function BookIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ));
}

/** Hands in prayer -- davening */
export function PrayerIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M12 2v4" />
      <path d="M6.8 15l-1.2 5" />
      <path d="M17.2 15l1.2 5" />
      <path d="M12 6c-2.5 0-4.5 1.5-5.2 3.7L5 15h14l-1.8-5.3C16.5 7.5 14.5 6 12 6z" />
      <path d="M8 15v2" />
      <path d="M16 15v2" />
    </>
  ));
}

/** Fork and knife -- meals */
export function MealIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </>
  ));
}

/** Clipboard with checkmark -- test/exam */
export function TestIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14l2 2 4-4" />
    </>
  ));
}

/** Moon -- bedtime/rest */
export function BedIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  ));
}

/** Bus -- trip/outing */
export function BusIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M8 6v6" />
      <path d="M16 6v6" />
      <rect x="4" y="3" width="16" height="13" rx="2" />
      <path d="M4 11h16" />
      <path d="M7 16v2" />
      <path d="M17 16v2" />
      <circle cx="7.5" cy="19.5" r="1.5" />
      <circle cx="16.5" cy="19.5" r="1.5" />
    </>
  ));
}

/** Running person -- sports/activity */
export function SportsIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <circle cx="14" cy="4" r="2" />
      <path d="M16.5 9L18 16l-3 1" />
      <path d="M11 9l-3 7 3 2" />
      <path d="M7 22l3-6" />
      <path d="M17 22l-2-6" />
      <path d="M9 9h7" />
    </>
  ));
}

/** Bell -- reminder */
export function BellIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ));
}

/** Megaphone -- announcement */
export function MegaphoneIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M3 11l18-5v12L3 13v-2z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ));
}

/** Clock -- wake up/time */
export function ClockIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ));
}

/** Coffee cup -- break */
export function CoffeeIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="2" x2="6" y2="4" />
      <line x1="10" y1="2" x2="10" y2="4" />
      <line x1="14" y1="2" x2="14" y2="4" />
    </>
  ));
}

/** Music note -- music */
export function MusicIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ));
}

/** Candle with flame -- candle lighting */
export function CandleIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <rect x="9" y="10" width="6" height="12" rx="1" />
      <path d="M12 2c1.5 1.5 2 3 2 4.5S13.5 9 12 10c-1.5-1-2-2.5-2-3.5S10.5 3.5 12 2z" />
    </>
  ));
}

/** Star -- shabbos/holiday */
export function StarIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ));
}

/** Calendar -- event */
export function CalendarIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ));
}

/** Sparkle/diamond -- special */
export function SparkleIcon({ size = 20, color = 'currentColor' }) {
  return svgBase(size, color, (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" />
    </>
  ));
}

/** Map from string key to component */
export const SCHEDULE_ICON_MAP = {
  book: BookIcon,
  prayer: PrayerIcon,
  meal: MealIcon,
  test: TestIcon,
  bed: BedIcon,
  bus: BusIcon,
  sports: SportsIcon,
  bell: BellIcon,
  megaphone: MegaphoneIcon,
  clock: ClockIcon,
  coffee: CoffeeIcon,
  music: MusicIcon,
  candle: CandleIcon,
  star: StarIcon,
  calendar: CalendarIcon,
  sparkle: SparkleIcon,
};

/** Ordered list for pickers */
export const ICON_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'book', label: 'Study/Learning' },
  { value: 'prayer', label: 'Prayer/Davening' },
  { value: 'meal', label: 'Meals/Food' },
  { value: 'test', label: 'Test/Exam' },
  { value: 'bed', label: 'Bedtime/Rest' },
  { value: 'bus', label: 'Trip/Outing' },
  { value: 'sports', label: 'Sports/Activity' },
  { value: 'bell', label: 'Bell/Reminder' },
  { value: 'megaphone', label: 'Announcement' },
  { value: 'clock', label: 'Wake Up' },
  { value: 'coffee', label: 'Break' },
  { value: 'music', label: 'Music' },
  { value: 'candle', label: 'Candle Lighting' },
  { value: 'star', label: 'Shabbos/Holiday' },
  { value: 'calendar', label: 'Event' },
  { value: 'sparkle', label: 'Special' },
];

/** Render an icon by its string key. Returns null if key is invalid. */
export function ScheduleIcon({ iconKey, size = 20, color = 'currentColor' }) {
  const Component = SCHEDULE_ICON_MAP[iconKey];
  if (!Component) return null;
  return <Component size={size} color={color} />;
}
