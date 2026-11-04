// CBT-I (therapy for insomnia) asks two things each morning that the Journal doesn't: how many times
// you woke in the night, and for how many minutes in all. They are kept as two Morning routine items
// (numbers), so they sync and export like any other; Stats is told which items they are and uses them:
// two night-by-night columns, and hours asleep that leave out the time awake.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Entry, RoutineItem } from './types';

const KEY = 'sleepjournal.cbtiItems.v1';

/** Which routine items hold the answers, by uid (the same on every device). */
export interface CbtiSources { wakes: string | null; awake: string | null }
export const NO_SOURCES: CbtiSources = { wakes: null, awake: null };

/** The names the items get when Stats adds them to the Morning routine. */
export const CBTI_LABELS = { wakes: 'Times woke in the night', awake: 'Minutes awake in the night' } as const;

export async function loadCbtiSources(): Promise<CbtiSources> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...NO_SOURCES, ...(JSON.parse(raw) as Partial<CbtiSources>) } : NO_SOURCES;
  } catch {
    return NO_SOURCES;
  }
}

export async function saveCbtiSources(s: CbtiSources): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** A night with the CBT-I answers. `hoursAsleep` leaves out the minutes awake, when there are some. */
export interface StatsEntry extends Entry {
  wakes: number | null;
  awakeMin: number | null;
}

const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function withCbti(entries: Entry[], items: RoutineItem[], sources: CbtiSources): StatsEntry[] {
  const idOf = (uid: string | null) => (uid ? items.find((i) => i.uid === uid)?.id : undefined);
  const wakesId = idOf(sources.wakes), awakeId = idOf(sources.awake);
  return entries.map((e) => {
    // Without a chosen item, a wake count imported from another diary still shows.
    const wakes = wakesId !== undefined ? asNumber(e.routine[wakesId]) : e.wakeCount;
    const awakeMin = awakeId !== undefined ? asNumber(e.routine[awakeId]) : null;
    const hoursAsleep = e.hoursAsleep !== null && awakeMin
      ? Math.round((e.hoursAsleep - awakeMin / 60) * 100) / 100
      : e.hoursAsleep;
    return { ...e, wakes, awakeMin, hoursAsleep };
  });
}
