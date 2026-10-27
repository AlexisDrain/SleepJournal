// The Stats tab's night-by-night table: which columns you switched off (hidden on screen and left
// out of its export). Remembered on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sleepjournal.statsHiddenColumns.v1';

export async function loadHiddenStatsColumns(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function saveHiddenStatsColumns(hidden: ReadonlySet<string>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...hidden]));
}
