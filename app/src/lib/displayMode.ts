// Settings → Display: dark (the default), light, or auto (light from 7 AM to 7 PM, dark otherwise).
// Remembered on this device. Screens call useThemeName() so they redraw when the colors change.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { applyTheme, themeName, type ThemeName } from './theme';

export type DisplayMode = 'dark' | 'light' | 'auto';

const KEY = 'sleepjournal.displayMode.v1';
/** "auto" is light from DAY_STARTS to DAY_ENDS (hours, local time). */
export const DAY_STARTS = 7;
export const DAY_ENDS = 19;

let mode: DisplayMode = 'dark';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function resolve(m: DisplayMode, now = new Date()): ThemeName {
  if (m !== 'auto') return m;
  const h = now.getHours();
  return h >= DAY_STARTS && h < DAY_ENDS ? 'light' : 'dark';
}

/** Re-check the colors (for "auto", the time of day may have moved on). */
function refresh() {
  const next = resolve(mode);
  if (next !== themeName()) applyTheme(next);
  notify();
}

export const displayModeReady: Promise<void> = AsyncStorage.getItem(KEY).then(
  (saved) => {
    if (saved === 'light' || saved === 'auto' || saved === 'dark') mode = saved;
  },
  () => {},
).then(() => {
  loaded = true;
  refresh();
});

// "auto" switches by itself: check every minute, and when the app comes back to the screen.
setInterval(() => { if (mode === 'auto') refresh(); }, 60_000);
AppState.addEventListener('change', (s) => { if (s === 'active' && mode === 'auto') refresh(); });

export const getDisplayMode = () => mode;

export async function setDisplayMode(next: DisplayMode): Promise<void> {
  mode = next;
  refresh();
  await AsyncStorage.setItem(KEY, next);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Listen for color changes; also run by ui.tsx to rebuild its shared styles. */
export const onThemeChange = subscribe;

/** The colors in use right now ('dark' or 'light'); a screen calling this redraws when they change. */
export function useThemeName(): ThemeName {
  return useSyncExternalStore(subscribe, themeName, themeName);
}

/** The saved choice; redraws when it changes. */
export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(subscribe, getDisplayMode, getDisplayMode);
}

/** False for a few milliseconds at launch, while the saved choice is read (so the app doesn't flash). */
export function useDisplayModeLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded, () => loaded);
}
