// Numbers for the Stats tab, worked out from a list of nights.
import { formatTime } from './clockFormat';
import { clockOf } from './time';
import type { Entry } from './types';

export interface Summary {
  /** Nights in the list. */
  nights: number;
  /** Average hours asleep, over nights where it can be worked out (and isn't negative). */
  avgHours: number | null;
  /** Average "tried to sleep" time, as minutes after noon (so 11 PM and 1 AM average to midnight). */
  avgTriedMin: number | null;
  /** Average "started the day" time, as minutes after midnight. */
  avgStartedMin: number | null;
  /** Tags, most used first. */
  tags: { name: string; count: number }[];
}

const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const minutesOf = (iso: string) => clockOf(iso).hour * 60 + clockOf(iso).minute;

export function summarize(entries: Entry[]): Summary {
  const hours = entries.map((e) => e.hoursAsleep).filter((h): h is number => h !== null && h >= 0);
  const tried = entries.map((e) => e.triedSleepAt ?? e.inBedAt).filter((t): t is string => !!t)
    .map((t) => (minutesOf(t) - 720 + 1440) % 1440);
  const started = entries.map((e) => e.dayStartedAt ?? e.wokeAt).filter((t): t is string => !!t).map(minutesOf);
  const counts = new Map<string, number>();
  for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const avgHours = average(hours);
  const avgTried = average(tried);
  const avgStarted = average(started);
  return {
    nights: entries.length,
    avgHours: avgHours === null ? null : Math.round(avgHours * 10) / 10,
    avgTriedMin: avgTried === null ? null : Math.round(avgTried),
    avgStartedMin: avgStarted === null ? null : Math.round(avgStarted),
    tags: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

/** Minutes after noon → "11:48 PM" (or "23:48"). */
export const formatAfterNoon = (min: number) => { const m = (min + 720) % 1440; return formatTime(Math.floor(m / 60), m % 60); };
/** Minutes after midnight → "7:52 AM" (or "07:52"). */
export const formatAfterMidnight = (min: number) => formatTime(Math.floor(min / 60) % 24, min % 60);
