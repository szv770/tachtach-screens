/**
 * Starter quick messages, written to data/quick-templates.json once (as shared
 * templates) the first time it is read. After that they are ordinary data:
 * editable and deletable. No names of schools or people: {placeholders} only.
 * `focus` is the blank shown large.
 */
const B = (key, label, type) => ({ key, label, type });
const bochur = B('bochur', 'Bochur', 'name');
const person = B('person', 'Person', 'person');

export const SEED_MARKER = 'starters-2026-10';

export const SEED_TEMPLATES = [
  { length: { kind: 'minutes', minutes: 15 }, text: '{bochur} come to the Menahel', blanks: [bochur], focus: 'bochur' },
  { length: { kind: 'minutes', minutes: 15 }, text: '{bochur} come to {person}\'s office', blanks: [bochur, person], focus: 'bochur' },
  { length: { kind: 'minutes', minutes: 15 }, text: '{bochur} please call home', blanks: [bochur], focus: 'bochur' },
  { length: { kind: 'minutes', minutes: 15 }, text: '{bochur} please call {person}', blanks: [bochur, person], focus: 'bochur' },
  { length: { kind: 'minutes', minutes: 15 }, text: '{person} is looking for {bochur}', blanks: [person, bochur], focus: 'bochur' },
  { length: { kind: 'minutes', minutes: 15 }, text: '{bochur} needed at {place}', blanks: [bochur, B('place', 'Place', 'place')], focus: 'bochur' },
  { length: { kind: 'eod' }, text: '{seder} moved to {time}', blanks: [B('seder', 'Seder / class', 'text'), B('time', 'New time', 'time')], focus: 'time' },
  { length: { kind: 'eod' }, text: 'Test on {day} at {time}', blanks: [B('day', 'Day', 'day'), B('time', 'Time', 'time')], focus: 'day' },
  { length: { kind: 'forever' }, text: '{place} out of order — please don\'t use', blanks: [B('place', 'Place', 'place')], focus: 'place' },
].map((t, i) => ({ textHe: '', display: 'slide', style: null, length: { kind: 'minutes', minutes: 60 }, order: i, ...t }));
