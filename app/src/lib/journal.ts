// Rules shared by the Journal screen and reminders: what "filled in" means,
// and which check-in to show when the app opens.
import { store } from '@/db/store';
import { formatHour } from './clockFormat';
import { addDays, clockOf, currentNight, dayLabel, toDateString, toLocalIso, type ClockTime } from './time';
import type { Entry, Phase } from './types';

/** A check-in counts as filled once its key time is in: bed/sleep time at night, wake time in the morning. */
export function isFilled(e: Pick<Entry, 'inBedAt' | 'triedSleepAt' | 'wokeAt'> | null, phase: Phase): boolean {
  if (!e) return false;
  return phase === 'bedtime' ? !!(e.inBedAt || e.triedSleepAt) : !!e.wokeAt;
}

/** Until this hour of the early morning, you are probably still going to bed, not getting up. */
const LATE_BEDTIME_UNTIL = 3;
/** The hour of the afternoon when the app moves on to the next night (see currentNight). */
const NEXT_NIGHT_AT = 15;

/**
 * When a check-in happens, under its title: bedtime starts the evening the night begins and runs past
 * midnight ("Saturday, Oct 17 · until Oct 18, 3 AM"); morning is the next day ("Sunday, Oct 18 · until 3 PM",
 * when the app moves to the next night).
 */
export function untilHint(phase: Phase, nightOf: string): string {
  if (phase === 'morning') return `${dayLabel(addDays(nightOf, 1))} · until ${formatHour(NEXT_NIGHT_AT)}`;
  // Bedtime runs past midnight, so its end names the next day: "Monday, Oct 19 · until Oct 20, 3 AM".
  const [y, m, d] = addDays(nightOf, 1).split('-').map(Number);
  const nextDay = new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dayLabel(nightOf)} · until ${nextDay}, ${formatHour(LATE_BEDTIME_UNTIL)}`;
}

/**
 * The calendar day the "anytime" routine list shows next to a given night. Anytime runs midnight
 * to midnight, while a night runs 3 PM to 3 PM, so the two don't line up:
 *   - on the current night it is always today;
 *   - on any other night it is the day that night ends on ("Friday night → Saturday morning": Saturday).
 * (Only between 3 PM and midnight do those differ, when today is the day the current night begins.)
 * Its ticks are stored with the night of that same date, so the spreadsheet row for a date holds
 * that date's anytime list.
 */
export function anytimeDay(nightOf: string, now = new Date()): string {
  return nightOf === currentNight(now) ? toDateString(now) : addDays(nightOf, 1);
}

/**
 * The check-in that's due right now: from 3 PM it's tonight's bedtime, and it stays bedtime
 * (of the night that began yesterday) until 3 AM, for nights you go to bed after midnight.
 * From 3 AM to 3 PM it's last night's morning.
 */
export function dueSlot(now = new Date()): { nightOf: string; phase: Phase } {
  const h = now.getHours();
  return { nightOf: currentNight(now), phase: h >= NEXT_NIGHT_AT || h < LATE_BEDTIME_UNTIL ? 'bedtime' : 'morning' };
}

/** The check-in right before a given one. */
function previousSlot(slot: { nightOf: string; phase: Phase }): { nightOf: string; phase: Phase } {
  return slot.phase === 'morning'
    ? { nightOf: slot.nightOf, phase: 'bedtime' }
    : { nightOf: addDays(slot.nightOf, -1), phase: 'morning' };
}

export interface Start {
  nightOf: string;
  open: Phase; // section shown open and on top
  missed: boolean; // true when `open` is a check-in you forgot (the one before what's due now)
}

/** Where the Journal should open: what's due now, unless you forgot the check-in just before it. */
export async function pickStart(now = new Date()): Promise<Start> {
  let due = dueSlot(now);
  // After midnight with bedtime already filled in, you're up early (or awake again): show the morning.
  if (due.phase === 'bedtime' && now.getHours() < LATE_BEDTIME_UNTIL && isFilled(await store.getEntry(due.nightOf), 'bedtime')) {
    due = { nightOf: due.nightOf, phase: 'morning' };
  }
  const prev = previousSlot(due);
  // A brand-new journal has nothing to have "forgotten" yet, and once what's due now is filled
  // in you've moved on, so only point back while the current check-in is still empty.
  const isNew = (await store.listEntries({ limit: 1 })).length === 0;
  const dueFilled = isFilled(await store.getEntry(due.nightOf), due.phase);
  const prevEntry = isNew || dueFilled ? null : await store.getEntry(prev.nightOf);
  if (!isNew && !dueFilled && !isFilled(prevEntry, prev.phase)) return { nightOf: prev.nightOf, open: prev.phase, missed: true };
  return { nightOf: due.nightOf, open: due.phase, missed: false };
}

// ---------- usual times (defaults when "now" isn't the right answer) ----------

type TimeField = 'inBedAt' | 'triedSleepAt' | 'wokeAt' | 'dayStartedAt';
export type UsualTimes = Record<TimeField, ClockTime>;

const FALLBACK: UsualTimes = {
  inBedAt: { hour: 23, minute: 0 },
  triedSleepAt: { hour: 23, minute: 30 },
  wokeAt: { hour: 8, minute: 0 },
  dayStartedAt: { hour: 8, minute: 30 },
};

/** Your typical time for each field: the median of recent nights, rounded to 5 minutes. */
export function usualTimes(entries: Entry[]): UsualTimes {
  const result = { ...FALLBACK };
  for (const field of Object.keys(FALLBACK) as TimeField[]) {
    // Bedtimes straddle midnight, so measure them from noon; mornings from midnight.
    const shift = field === 'inBedAt' || field === 'triedSleepAt' ? 720 : 0;
    const mins = entries
      .map((e) => e[field])
      .filter((v): v is string => !!v)
      .map((iso) => (clockOf(iso).hour * 60 + clockOf(iso).minute - shift + 1440) % 1440)
      .sort((a, b) => a - b);
    if (mins.length === 0) continue;
    const median = (Math.round(mins[Math.floor(mins.length / 2)] / 5) * 5 + shift) % 1440;
    result[field] = { hour: Math.floor(median / 60), minute: median % 60 };
  }
  return result;
}

export async function loadUsualTimes(): Promise<UsualTimes> {
  return usualTimes(await store.listEntries({ limit: 14 }));
}

// ---------- sanity check ----------

const MAX_SLEEP_HOURS = 16;

/**
 * Catches AM/PM slips: if the wake time is before you went to sleep, or more than 16 hours after,
 * returns how long that would be and, when moving it 12 hours makes sense, the corrected time.
 */
export function wakeTimeProblem(sleepStart: string | null, woke: string | null): { hours: number; fix: string | null } | null {
  if (!sleepStart || !woke) return null;
  const hoursFrom = (t: number) => (t - Date.parse(sleepStart)) / 3_600_000;
  const hours = hoursFrom(Date.parse(woke));
  if (hours > 0 && hours <= MAX_SLEEP_HOURS) return null;
  for (const shift of [-12, 12]) {
    const alt = Date.parse(woke) + shift * 3_600_000;
    if (hoursFrom(alt) > 0 && hoursFrom(alt) <= MAX_SLEEP_HOURS) return { hours, fix: toLocalIso(new Date(alt)) };
  }
  return { hours, fix: null };
}
