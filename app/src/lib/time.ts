// "Night of" dates: the night of 9-26 is the one you wake up from on 9-27.
import { formatTime } from './clockFormat';
import type { RoutinePhase } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local ISO timestamp with the UTC offset: "2026-09-26T23:30:00-07:00".
 * Unlike toISOString() (always UTC), it keeps the wall-clock time you saw, which the
 * database uses for averages and the CSV export shows as-is.
 */
export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${toDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function weekdayOf(nightOf: string): string {
  return parseDateString(nightOf).toLocaleDateString('en-US', { weekday: 'long' });
}

function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(nightOf: string, days: number): string {
  const d = parseDateString(nightOf);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Before 3 PM you're still in (or writing about) last night; after that, tonight. */
export function currentNight(now = new Date()): string {
  return now.getHours() < 15 ? addDays(toDateString(now), -1) : toDateString(now);
}

/**
 * A picked clock time placed on the right calendar day for this night.
 * Night times from 3 PM on are that evening; earlier ones are after midnight.
 * Morning times are always the next day.
 * "Anytime" items belong to a calendar day, not a night: their time stays on that date.
 */
export function timeOnNight(nightOf: string, hours: number, minutes: number, phase: RoutinePhase): Date {
  const d = parseDateString(nightOf);
  const nextDay = phase === 'morning' || (phase === 'bedtime' && hours < 15);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (nextDay ? 1 : 0), hours, minutes);
}

/** "now", rounded to 5 minutes and placed on the given night */
export function nowOnNight(nightOf: string, phase: RoutinePhase): Date {
  const now = new Date();
  const m = Math.round(now.getMinutes() / 5) * 5;
  return timeOnNight(nightOf, now.getHours() + Math.floor(m / 60), m % 60, phase);
}

/**
 * Is "now" a believable value for this field? Only when the current time falls in that
 * check-in's own window on the right day: a morning time between 3 AM and 3 PM of the next day,
 * a bedtime between 3 PM and 6 AM. Filling in a morning that evening must not default to a PM time.
 */
export function canSetToNow(nightOf: string, phase: 'bedtime' | 'morning', now = new Date()): boolean {
  const h = now.getHours();
  const inWindow = phase === 'morning' ? h >= 3 && h < 15 : h >= 15 || h < 6;
  return inWindow && toDateString(timeOnNight(nightOf, h, now.getMinutes(), phase)) === toDateString(now);
}

export interface ClockTime { hour: number; minute: number }

/** The wall-clock time inside a stored timestamp ("…T22:30:00-07:00" → 22:30). */
export function clockOf(iso: string): ClockTime {
  return { hour: Number(iso.slice(11, 13)), minute: Number(iso.slice(14, 16)) };
}

export function formatClockTime(t: ClockTime): string {
  return formatTime(t.hour, t.minute);
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return formatTime(d.getHours(), d.getMinutes());
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/** "Friday night → Saturday morning" */
export function nightLabel(nightOf: string): string {
  const d = parseDateString(nightOf);
  const next = parseDateString(addDays(nightOf, 1));
  const day = (x: Date) => x.toLocaleDateString([], { weekday: 'long' });
  return `${day(d)} night → ${day(next)} morning`;
}

/** "Saturday, Oct 10" */
export function dayLabel(date: string): string {
  return parseDateString(date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export function shortDate(nightOf: string): string {
  return parseDateString(nightOf).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
