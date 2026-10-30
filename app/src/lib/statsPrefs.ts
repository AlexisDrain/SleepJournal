// The Stats tab's night-by-night table: which columns you switched off (hidden on screen and left
// out of its export). Remembered on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sleepjournal.statsHiddenColumns.v1';
/** Columns that start switched off. The marker says that was done, so ticking one on sticks. */
const OFF_AT_FIRST = ['bed', 'woke'];
const APPLIED = 'defaults:2';

export async function loadHiddenStatsColumns(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    return saved.has(APPLIED) ? saved : new Set([...saved, ...OFF_AT_FIRST, APPLIED]);
  } catch {
    return new Set([...OFF_AT_FIRST, APPLIED]);
  }
}

export async function saveHiddenStatsColumns(hidden: ReadonlySet<string>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...hidden]));
}
