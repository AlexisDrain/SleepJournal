// Two regional choices, remembered on this device:
//   - which day the calendar's week starts on (Monday, or Sunday as in the US). The first time the
//     app opens it takes the region's usual day; after that only Settings → Locale changes it.
//   - how dates are written in spreadsheets (Settings → Advanced): 2026-10-23 (the default),
//     10-23-2026 (US) or 23-10-2026.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type DateStyle = 'ymd' | 'mdy' | 'dmy';

const KEY = 'sleepjournal.localePrefs.v1';

// Regions where the week usually starts on Sunday; most others start on Monday.
const SUNDAY_REGIONS = new Set(['US', 'CA', 'MX', 'BR', 'JP', 'KR', 'TW', 'HK', 'IL', 'PH', 'ZA', 'SA', 'PE', 'CO', 'VE', 'GT', 'HN', 'NI', 'PA', 'DO', 'PR', 'BZ', 'KH', 'TH', 'IN', 'PK', 'ZW', 'KE', 'ET']);

function regionStartsMonday(): boolean {
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "en-US", "fr-FR"
    const region = locale.split('-').find((part) => /^[A-Z]{2}$/.test(part));
    return region ? !SUNDAY_REGIONS.has(region) : true;
  } catch {
    return false;
  }
}

let prefs: { mondayFirst: boolean; dateStyle: DateStyle } = { mondayFirst: regionStartsMonday(), dateStyle: 'ymd' };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Resolves once the saved choices have been read. Exports wait for it, so dates are never a guess. */
export const localePrefsReady: Promise<void> = AsyncStorage.getItem(KEY).then(
  (raw) => {
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<typeof prefs>;
        prefs = {
          mondayFirst: saved.mondayFirst ?? prefs.mondayFirst,
          dateStyle: saved.dateStyle === 'mdy' || saved.dateStyle === 'dmy' ? saved.dateStyle : 'ymd',
        };
        notify();
      } catch {
        // keep the defaults
      }
    } else {
      AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {}); // first opening: keep the region's week
    }
  },
  () => {},
);

export const getMondayFirst = () => prefs.mondayFirst;
export const getDateStyle = () => prefs.dateStyle;

async function save(patch: Partial<typeof prefs>) {
  prefs = { ...prefs, ...patch };
  notify();
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
export const setMondayFirst = (on: boolean) => save({ mondayFirst: on });
export const setDateStyle = (style: DateStyle) => save({ dateStyle: style });

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const useMondayFirst = () => useSyncExternalStore(subscribe, getMondayFirst, getMondayFirst);
export const useDateStyle = () => useSyncExternalStore(subscribe, getDateStyle, getDateStyle);

/** "2026-10-23" (a night's date) → how spreadsheets show it in the chosen style. */
export function formatSheetDate(isoDate: string, style: DateStyle = prefs.dateStyle): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (style === 'mdy') return `${m}-${d}-${y}`;
  if (style === 'dmy') return `${d}-${m}-${y}`;
  return isoDate;
}
