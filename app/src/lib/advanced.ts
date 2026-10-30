// Settings → Advanced: ask one time instead of two.
//   combineBed:     "Got in bed" and "Trying to sleep" become one question
//   combineMorning: "Woke up" and "Started the day" become one question
// The one answer is saved in both fields, so the spreadsheet and "hours asleep" keep working.
// Also how "hours asleep" is counted. Remembered on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface Combine { bed: boolean; morning: boolean }

/** What "hours asleep" runs from and to. The first is the default. */
export type HoursMethod = 'tried-woke' | 'tried-started' | 'bed-woke' | 'bed-started';
export const HOURS_METHODS: [HoursMethod, string][] = [
  ['tried-woke', 'Trying to sleep → Woke up'],
  ['tried-started', 'Trying to sleep → Started the day'],
  ['bed-woke', 'Got in bed → Woke up'],
  ['bed-started', 'Got in bed → Started the day'],
];

const KEY = 'sleepjournal.combineTimes.v1';
let combine: Combine = { bed: false, morning: false };
let hoursMethod: HoursMethod = 'tried-woke';
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY).then((raw) => {
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as Partial<Combine>;
    combine = { bed: !!saved.bed, morning: !!saved.morning };
    listeners.forEach((fn) => fn());
  } catch {
    // keep the defaults
  }
}, () => {});

export async function setCombine(patch: Partial<Combine>): Promise<void> {
  combine = { ...combine, ...patch };
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(KEY, JSON.stringify(combine));
}

const HOURS_KEY = 'sleepjournal.hoursMethod.v1';
/** Resolves once the saved choice is read: spreadsheets wait for it, never a guess. */
export const advancedReady: Promise<void> = AsyncStorage.getItem(HOURS_KEY).then((raw) => {
  if (!HOURS_METHODS.some(([m]) => m === raw)) return;
  hoursMethod = raw as HoursMethod;
  listeners.forEach((fn) => fn());
}, () => {});

export const getHoursMethod = () => hoursMethod;

export async function setHoursMethod(method: HoursMethod): Promise<void> {
  hoursMethod = method;
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(HOURS_KEY, method);
}

export function useHoursMethod(): HoursMethod {
  return useSyncExternalStore(subscribe, getHoursMethod, getHoursMethod);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useCombine(): Combine {
  return useSyncExternalStore(subscribe, () => combine, () => combine);
}
