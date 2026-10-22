// Settings → Advanced: ask one time instead of two.
//   combineBed:     "Got in bed" and "Trying to sleep" become one question
//   combineMorning: "Woke up" and "Started the day" become one question
// The one answer is saved in both fields, so the spreadsheet and "hours asleep" keep working.
// Remembered on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface Combine { bed: boolean; morning: boolean }

const KEY = 'sleepjournal.combineTimes.v1';
let combine: Combine = { bed: false, morning: false };
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

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useCombine(): Combine {
  return useSyncExternalStore(subscribe, () => combine, () => combine);
}
