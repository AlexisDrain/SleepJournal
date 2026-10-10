// Which check-in is shown first, Bedtime or Morning: a display choice remembered on this device.
// It only changes the order on screen (Journal and Routines); the data and the spreadsheet's
// columns stay as they are.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { Phase } from './types';

const KEY = 'sleepjournal.morningFirst.v1';
const BEDTIME_FIRST: Phase[] = ['bedtime', 'morning'];
const MORNING_FIRST: Phase[] = ['morning', 'bedtime'];

let order = BEDTIME_FIRST;
const listeners = new Set<() => void>();
const set = (next: Phase[]) => {
  order = next;
  listeners.forEach((fn) => fn());
};

AsyncStorage.getItem(KEY).then((v) => v === '1' && set(MORNING_FIRST), () => {});

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The two check-ins in the order to show them, and a function that swaps them (on every screen). */
export function usePhaseOrder(): [Phase[], () => void] {
  const phases = useSyncExternalStore(subscribe, () => order, () => order);
  const swap = () => {
    const next = order === BEDTIME_FIRST ? MORNING_FIRST : BEDTIME_FIRST;
    set(next);
    AsyncStorage.setItem(KEY, next === MORNING_FIRST ? '1' : '0').catch(() => {});
  };
  return [phases, swap];
}
