// Has this device seen the welcome screens? Stored on the phone, not the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'sleepjournal.welcomeSeen.v1';

let seen: boolean | null = null; // null = not read from storage yet
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(KEY)
  .then((v) => (seen = v === 'true'))
  .catch(() => (seen = false))
  .finally(emit);

export async function setWelcomeSeen(value: boolean) {
  seen = value;
  emit();
  await AsyncStorage.setItem(KEY, String(value));
}

/** true / false, or null while still loading. */
export function useWelcomeSeen(): boolean | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => seen,
  );
}
