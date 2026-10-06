// Which export columns the user switched OFF, remembered on this phone.
// Storing exclusions (not inclusions) means new columns, like a new routine item, start switched on.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sleepjournal.exportExcluded.v1';

export async function loadExcluded(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function saveExcluded(excluded: ReadonlySet<string>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...excluded]));
}

const DETAIL_KEY = 'sleepjournal.exportRoutineDetail.v1';

/** Whether spreadsheets show one column per routine item next to the compact summary. Off unless you turn it on. */
export async function loadRoutineDetail(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DETAIL_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveRoutineDetail(on: boolean): Promise<void> {
  await AsyncStorage.setItem(DETAIL_KEY, String(on));
}

const GAPS_KEY = 'sleepjournal.exportFillGaps.v1';

/** Whether exports include blank rows for nights with no entry. Off unless you turn it on. */
export async function loadFillGaps(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GAPS_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveFillGaps(on: boolean): Promise<void> {
  await AsyncStorage.setItem(GAPS_KEY, String(on));
}
