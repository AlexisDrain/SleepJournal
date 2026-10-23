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

/** The Sheet tab's own column order (headers), or null for the default. Doesn't affect exports. */
const ORDER_KEY = 'sleepjournal.sheetTabColumnOrder.v1';
export async function loadColumnOrder(): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
export async function saveColumnOrder(order: string[] | null): Promise<void> {
  if (order) await AsyncStorage.setItem(ORDER_KEY, JSON.stringify(order));
  else await AsyncStorage.removeItem(ORDER_KEY);
}

/** Text you read rather than scan; the Sheet tab keeps them side by side, at the end, by default. */
export const TEXT_COLUMNS = ['Tags', 'Bedtime note', 'Morning note', 'Dream'];

/**
 * The Sheet tab's column order: "Night of" first, then your saved order, with any column you
 * haven't placed yet (a new routine item, say) in its usual spot after them.
 */
export function arrangeColumns(headers: string[], saved: string[] | null): string[] {
  const [first, ...rest] = headers;
  const usual = [...rest.filter((h) => !TEXT_COLUMNS.includes(h)), ...TEXT_COLUMNS.filter((h) => rest.includes(h))];
  if (!saved) return [first, ...usual];
  const placed = saved.filter((h) => rest.includes(h));
  return [first, ...placed, ...usual.filter((h) => !placed.includes(h))];
}

export async function saveFillGaps(on: boolean, scope: PrefScope = 'export'): Promise<void> {
  await AsyncStorage.setItem(KEYS[scope].gaps, String(on));
}
