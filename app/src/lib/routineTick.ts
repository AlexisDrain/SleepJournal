// What ticking a routine item saves, before anything is typed. Saved right away, so the tick belongs
// to that day like any other answer (and shows ticked on that day only):
//   check  → true
//   time   → the time now (to the nearest 5 minutes), on that night
//   number → 0
//   text   → "?" (a note not written yet: a blank cell in the Google Sheet would read as not done)
import { nowOnNight, toLocalIso } from './time';
import type { RoutineItem, RoutinePhase, RoutineValue } from './types';

/** A ticked note with nothing written. The box shows it empty. */
export const EMPTY_NOTE = '?';

export function tickedValue(kind: RoutineItem['kind'], nightOf: string, phase: RoutinePhase, now = new Date()): RoutineValue {
  switch (kind) {
    case 'check': return true;
    case 'time': return toLocalIso(nowOnNight(nightOf, phase, now));
    case 'number': return 0;
    case 'text': return EMPTY_NOTE;
  }
}

/** Ticked: anything saved but null / false. 0 and "?" count. */
export const isTicked = (v: RoutineValue | undefined) => v !== undefined && v !== null && v !== false;

/** What typing in a note box saves: cleared is "?" (still ticked). */
export const typedText = (text: string): RoutineValue => (text.trim() === '' ? EMPTY_NOTE : text);

/** What typing in a number box saves: cleared is 0 (still ticked); unreadable keeps the last number. */
export function typedNumber(text: string, before: RoutineValue): RoutineValue {
  if (text.trim() === '') return 0;
  const n = Number(text.replace(',', '.'));
  return Number.isNaN(n) ? before : n;
}
