// Which check-in is shown first, Bedtime or Morning: a display choice remembered on this device,
// separately for the Journal and for Routines. It only changes the order on screen; the data and
// the spreadsheet's columns stay as they are.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { Phase } from './types';

export type OrderedScreen = 'journal' | 'routines';

const KEY: Record<OrderedScreen, string> = {
  journal: 'sleepjournal.morningFirst.v1',
  routines: 'sleepjournal.morningFirst.routines.v1',
};
const BEDTIME_FIRST: Phase[] = ['bedtime', 'morning'];
const MORNING_FIRST: Phase[] = ['morning', 'bedtime'];

const order: Record<OrderedScreen, Phase[]> = { journal: BEDTIME_FIRST, routines: BEDTIME_FIRST };
const listeners = new Set<() => void>();
const set = (screen: OrderedScreen, next: Phase[]) => {
  order[screen] = next;
  listeners.forEach((fn) => fn());
};

for (const screen of Object.keys(KEY) as OrderedScreen[]) {
  AsyncStorage.getItem(KEY[screen]).then((v) => v === '1' && set(screen, MORNING_FIRST), () => {});
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The two check-ins in the order this screen shows them, and a function that swaps them. */
export function usePhaseOrder(screen: OrderedScreen): [Phase[], () => void] {
  const phases = useSyncExternalStore(subscribe, () => order[screen], () => order[screen]);
  const swap = () => {
    const next = order[screen] === BEDTIME_FIRST ? MORNING_FIRST : BEDTIME_FIRST;
    set(screen, next);
    AsyncStorage.setItem(KEY[screen], next === MORNING_FIRST ? '1' : '0').catch(() => {});
  };
  return [phases, swap];
}
