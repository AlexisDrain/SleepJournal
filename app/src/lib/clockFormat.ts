// 12-hour ("11:30 PM") or 24-hour ("23:30") times: one choice for the whole app, including what
// is written to exports and the Google Sheet. The first time the app is opened it takes whatever
// this device's region uses and remembers that; after that only Settings changes it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'sleepjournal.hour24.v1';

/** Does this device's region write 1 PM as "13"? */
function regionUses24h(): boolean {
  try {
    return /13/.test(new Date(2000, 0, 1, 13).toLocaleTimeString([], { hour: 'numeric' }));
  } catch {
    return false;
  }
}

let hour24 = regionUses24h();
const listeners = new Set<() => void>();

/** Resolves once the saved choice has been read. Wait for it before writing times anywhere lasting. */
export const clockFormatReady: Promise<void> = AsyncStorage.getItem(KEY).then(
  (saved) => {
    if (saved === '1' || saved === '0') {
      hour24 = saved === '1';
      listeners.forEach((fn) => fn());
    } else {
      AsyncStorage.setItem(KEY, hour24 ? '1' : '0').catch(() => {}); // first opening: keep the region's style
    }
  },
  () => {},
);

export const isHour24 = () => hour24;

export async function setHour24(value: boolean): Promise<void> {
  hour24 = value;
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(KEY, value ? '1' : '0');
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The current choice; a screen that calls this redraws its times when the setting changes. */
export function useHour24(): boolean {
  return useSyncExternalStore(subscribe, isHour24, isHour24);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 23, 30 → "23:30" or "11:30 PM" */
export function formatTime(hour: number, minute: number): string {
  return hour24 ? `${pad(hour)}:${pad(minute)}` : `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** 15 → "15:00" or "3 PM" */
export function formatHour(hour: number): string {
  return hour24 ? `${pad(hour)}:00` : `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}
