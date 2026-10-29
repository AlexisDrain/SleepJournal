export type Phase = 'bedtime' | 'morning';
/** Which list a routine item is on: one of the two check-ins, or "anytime" (not tied to either). */
export type RoutinePhase = Phase | 'anytime';

export interface Entry {
  id: number;
  nightOf: string; // YYYY-MM-DD, the date the night starts on
  weekday: string;
  inBedAt: string | null; // local ISO timestamps, e.g. 2026-09-26T23:30:00-07:00
  triedSleepAt: string | null;
  sleepLatencyMin: number | null;
  wokeAt: string | null;
  dayStartedAt: string | null;
  hoursAsleep: number | null; // computed in SQL
  wakeCount: number | null;
  rested: number | null; // 1 exhausted … 5 well rested
  /** You cleared "rested" on purpose for this night (so the pre-selected 3 doesn't come back). Kept on this device only. */
  restedSkipped: boolean;
  bedtimeNote: string | null;
  morningNote: string | null;
  dream: string | null;
  tags: string[];
  /** routine item id → value (true, a time, a number or text). Missing = not done. */
  routine: Record<string, RoutineValue>;
  updatedAt: string; // last change, UTC "2026-09-27T05:30:00Z"
}
export type RoutineValue = string | number | boolean | null;

type Computed = 'id' | 'nightOf' | 'weekday' | 'hoursAsleep' | 'updatedAt';
export type EntryPatch = Partial<Omit<Entry, Computed>>;

/** `archived` = hidden: off the list you pick from, but still on the nights that have it. */
export interface Tag { id: number; name: string; archived: boolean }

/** A bedtime/morning routine row. Every item is checked off; some also record a value. */
export interface RoutineItem {
  id: number;
  label: string;
  phase: RoutinePhase;
  kind: 'check' | 'time' | 'number' | 'text';
  sortOrder: number;
  archived: boolean;
  /** The same on every device that syncs with the same sheet (`id` is only this device's). */
  uid: string;
  /** When the item itself (name, order, hidden…) last changed: "2026-10-06T18:30:00Z", '' = never. */
  updatedAt: string;
  /** Hidden: the first night it stopped counting ("2026-10-28"). Earlier nights still show it. */
  hiddenSince: string | null;
}

export interface Nap { id: number; startAt: string; endAt: string | null; note: string | null }
