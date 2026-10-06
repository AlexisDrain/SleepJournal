// How the Journal asks its questions: one at a time ("steps", friendlier when you're new)
// or everything on one page ("all"). Remembered on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '@/db/store';

export type JournalMode = 'steps' | 'all';

const KEY = 'sleepjournal.journalMode.v1';
const NEW_USER_NIGHTS = 3;

/** Your saved choice; if you never chose, step-by-step until you've logged a few nights. */
export async function loadJournalMode(): Promise<JournalMode> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'steps' || saved === 'all') return saved;
  } catch {
    // fall through to the default
  }
  return (await store.listEntries({ limit: NEW_USER_NIGHTS })).length < NEW_USER_NIGHTS ? 'steps' : 'all';
}

export async function saveJournalMode(mode: JournalMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode);
}
