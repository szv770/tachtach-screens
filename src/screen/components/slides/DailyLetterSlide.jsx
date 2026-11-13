import React, { useMemo } from 'react';
import AnnouncementSlide from './AnnouncementSlide.jsx';
import { pickDailyStory } from '../../../shared/dailyStories.js';
import { letterEntryItem } from '../../../shared/letterhead.js';

/**
 * Daily Letter: today's letter, typed out on a sheet of letterhead (src/shared/letterhead.js + takeover/letterhead/).
 * The list is edited in admin Screen > Daily Letter; the pick is a pure function of the date (same rules as the
 * Daily Story: a date you pinned wins, else a shuffle that repeats nothing until every letter has shown), so every
 * screen shows the same letter. Slide seconds 0 = automatic: the slide stays up exactly as long as the letter takes to
 * type and read (a number is a minimum). A long letter shows its next lines on a new page; it is never cut.
 */
export default function DailyLetterSlide({ dailyLetters, dateISO, onRequestDuration, slide }) {
  const entry = pickDailyStory(dailyLetters, dateISO);
  const base = Number(slide?.duration) || 0;
  const item = useMemo(() => (entry ? letterEntryItem(entry, base) : null), [entry, base]);
  if (!item) return null;
  return <AnnouncementSlide item={item} onRequestDuration={onRequestDuration} />;
}
