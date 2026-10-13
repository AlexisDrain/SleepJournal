// Which columns are switched OFF, and two layout switches, remembered on this device.
// There are two separate sets of choices:
//   'export': files you export from Settings, and what a connected Google Sheet shows
//   'sheet':  the Sheet tab inside the app
// Storing exclusions (not inclusions) means new columns, like a new routine item, start switched on.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PrefScope = 'export' | 'sheet';

const KEYS: Record<PrefScope, { excluded: string; detail: string; gaps: string }> = {
  export: {
    excluded: 'sleepjournal.exportExcluded.v1',
    detail: 'sleepjournal.exportRoutineDetail.v1',
    gaps: 'sleepjournal.exportFillGaps.v1',
  },
  sheet: {
    excluded: 'sleepjournal.sheetTabExcluded.v1',
    detail: 'sleepjournal.sheetTabRoutineDetail.v1',
    gaps: 'sleepjournal.sheetTabFillGaps.v1',
  },
};

/**
 * Reads one choice. The Sheet tab used to share the export choices, so until it has its own
 * it starts from those (what it looked like before the two were separated).
 */
async function read(scope: PrefScope, which: 'excluded' | 'detail' | 'gaps'): Promise<string | null> {
  try {
    const own = await AsyncStorage.getItem(KEYS[scope][which]);
    return own === null && scope === 'sheet' ? await AsyncStorage.getItem(KEYS.export[which]) : own;
  } catch {
    return null;
  }
}

export async function loadExcluded(scope: PrefScope = 'export'): Promise<Set<string>> {
  try {
    const raw = await read(scope, 'excluded');
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function saveExcluded(excluded: ReadonlySet<string>, scope: PrefScope = 'export'): Promise<void> {
  await AsyncStorage.setItem(KEYS[scope].excluded, JSON.stringify([...excluded]));
}

/** Whether to show one column per routine item next to the compact summary. Off unless you turn it on. */
export async function loadRoutineDetail(scope: PrefScope = 'export'): Promise<boolean> {
  return (await read(scope, 'detail')) === 'true';
}

export async function saveRoutineDetail(on: boolean, scope: PrefScope = 'export'): Promise<void> {
  await AsyncStorage.setItem(KEYS[scope].detail, String(on));
}

/** Whether to include blank rows for nights with no entry. Off unless you turn it on. */
export async function loadFillGaps(scope: PrefScope = 'export'): Promise<boolean> {
  return (await read(scope, 'gaps')) === 'true';
}

export async function saveFillGaps(on: boolean, scope: PrefScope = 'export'): Promise<void> {
  await AsyncStorage.setItem(KEYS[scope].gaps, String(on));
}
