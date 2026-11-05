// CBT-I (therapy for insomnia) asks two things each morning that the Journal doesn't: how many times
// you woke in the night, and for how many minutes in all. They are kept as two Morning routine items
// (numbers), so they sync and export like any other; Stats is told which items they are and uses them:
// two night-by-night columns, and hours asleep that leave out the time awake.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '@/db/store';
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

const KEYS = Object.keys(CBTI_LABELS) as (keyof CbtiSources)[];

/**
 * The start of each question's uid. The uid syncs with the item and never changes when it's renamed,
 * so every device knows the questions by it, whatever they're called now.
 */
export const cbtiUidPrefix = (k: keyof CbtiSources) => `cbti-${k}-`;

/**
 * Which items are the CBT-I questions. Remembered per device; a device that hasn't been told yet finds
 * them by their uid's mark. Items made before the mark (Nov 2026) are found by their Morning label.
 * The one in use beats a hidden one.
 */
export function findCbtiSources(items: RoutineItem[], saved: CbtiSources): CbtiSources {
  const next = { ...saved };
  const pick = (found: RoutineItem[]) => (found.find((i) => !i.archived) ?? found[0])?.uid;
  for (const k of KEYS) {
    if (next[k] && items.some((i) => i.uid === next[k])) continue;
    next[k] = pick(items.filter((i) => i.uid.startsWith(cbtiUidPrefix(k))))
      ?? pick(items.filter((i) => i.phase === 'morning' && i.label === CBTI_LABELS[k]))
      ?? next[k];
  }
  return next;
}

/** The sources for these items, saved when they were just found. */
export async function resolveCbtiSources(items: RoutineItem[]): Promise<CbtiSources> {
  const saved = await loadCbtiSources();
  const next = findCbtiSources(items, saved);
  if (KEYS.some((k) => next[k] !== saved[k])) await saveCbtiSources(next).catch(() => {});
  return next;
}

/** The uids to mark with a ★. */
export const starredUids = (s: CbtiSources) => new Set([s.wakes, s.awake].filter((u): u is string => !!u));

const itemFor = (items: RoutineItem[], s: CbtiSources, k: keyof CbtiSources) => items.find((i) => i.uid === s[k]);
/** The question is in the Morning routine (not hidden). */
export const cbtiShown = (items: RoutineItem[], s: CbtiSources, k: keyof CbtiSources) => {
  const i = itemFor(items, s, k);
  return !!i && !i.archived;
};

/**
 * Puts a question in the Morning routine: brings its hidden item back, or makes a new one.
 * Returns the sources (with the new item's uid).
 */
export async function addCbtiQuestion(k: keyof CbtiSources): Promise<CbtiSources> {
  const s = await resolveCbtiSources(await store.routine.list());
  const had = itemFor(await store.routine.list(), s, k);
  if (had) {
    if (had.archived) await store.routine.update(had.id, { archived: false });
    return s;
  }
  const made = await store.routine.create({ label: CBTI_LABELS[k], phase: 'morning', kind: 'number' }, cbtiUidPrefix(k));
  const next = { ...s, [k]: made.uid };
  await saveCbtiSources(next);
  return next;
}

/** Hides a question (like Hide in Routines): nights already answered keep their answers. */
export async function removeCbtiQuestion(k: keyof CbtiSources): Promise<void> {
  const items = await store.routine.list();
  const had = itemFor(items, await resolveCbtiSources(items), k);
  if (had && !had.archived) await store.routine.update(had.id, { archived: true });
}

/** Both questions in or out at once (Settings → Advanced). */
export async function setCbtiQuestions(on: boolean): Promise<void> {
  for (const k of KEYS) await (on ? addCbtiQuestion(k) : removeCbtiQuestion(k));
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
