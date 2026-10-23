// Opt-in reminders that only fire if you haven't filled the check-in yet.
//
// Expo Go can't run code in the background to check at reminder time, so instead the app
// schedules one-off reminders for the next 7 days and skips (or cancels) any check-in that's
// already filled. syncReminders() runs on launch, on resume and after each save, which keeps
// the week topped up. Everything is local to the phone and works offline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { store } from '@/db/store';
import { isFilled } from './journal';
import { addDays, currentNight, timeOnNight } from './time';
import type { Phase } from './types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Reminders exist on phones only (see notifications.web.ts). */
export const remindersSupported = true;

/** Tapping a reminder opens the Journal. */
export function useReminderTap(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (enabled && typeof url === 'string') router.navigate(url as '/');
  }, [response, enabled]);
}

export interface Reminder {
  phase: Phase;
  hour: number;
  minute: number;
}

const COPY: Record<Phase, { title: string; body: string }> = {
  bedtime: { title: 'Heading to bed?', body: 'Note down your bedtime before you sleep.' },
  morning: { title: 'Good morning', body: 'How did you sleep? Note it down while you remember.' },
};

const PREFS_KEY = 'sleepjournal.reminders.v1';
const ID_PREFIX = 'sj-reminder-';
const DAYS_AHEAD = 7;
// Older versions used one repeating reminder per phase under these ids.
const LEGACY_IDS = ['sleep-journal-bedtime', 'sleep-journal-morning'];

type Prefs = Partial<Record<Phase, Reminder>>;

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return req.granted;
}

/** The reminder times you chose (stored on the phone). */
export async function getReminders(): Promise<Prefs> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PREFS_KEY)) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}

async function savePrefs(prefs: Prefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  await syncReminders();
}

export async function setReminder(r: Reminder): Promise<void> {
  await savePrefs({ ...(await getReminders()), [r.phase]: r });
}

export async function clearReminder(phase: Phase): Promise<void> {
  const prefs = await getReminders();
  delete prefs[phase];
  await savePrefs(prefs);
}

let planning: Promise<void> = Promise.resolve();

/** How many reminders are waiting on this phone, and when the next one goes off. */
export async function plannedReminders(): Promise<{ count: number; next: Date | null }> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const times = all
    .map((n) => (n.trigger && 'value' in n.trigger ? Number(n.trigger.value) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  return { count: all.length, next: times.length ? new Date(times[0]) : null };
}

/**
 * Re-plan the next week of reminders, skipping check-ins that are already filled.
 * Runs one at a time: two overlapping runs (say, on launch and right after a save) could
 * otherwise interleave, and the older one would put back a reminder the newer one had dropped.
 */
export function syncReminders(): Promise<void> {
  const run = planning.then(planReminders, planReminders);
  planning = run.catch(() => {});
  return run;
}

async function planReminders(): Promise<void> {
  const prefs = await getReminders();
  // This app schedules nothing but these reminders, so clear all of them and plan again. (Matching
  // them by id isn't reliable: Expo Go reports scheduled ids in its own form, so some reminders,
  // including ones for nights already filled in or after turning reminders off, were never cancelled.)
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.bedtime && !prefs.morning) return;

  const first = addDays(currentNight(), -1);
  const entries = await store.listEntries({ from: first, to: addDays(first, DAYS_AHEAD + 1), limit: 50 });
  const byNight = new Map(entries.map((e) => [e.nightOf, e]));
  const now = Date.now();

  for (let i = 0; i <= DAYS_AHEAD + 1; i++) {
    const nightOf = addDays(first, i);
    for (const phase of ['bedtime', 'morning'] as const) {
      const r = prefs[phase];
      if (!r) continue;
      const fireAt = timeOnNight(nightOf, r.hour, r.minute, phase);
      if (fireAt.getTime() <= now || fireAt.getTime() > now + DAYS_AHEAD * 86_400_000) continue;
      if (isFilled(byNight.get(nightOf) ?? null, phase)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${phase}-${nightOf}`,
        content: { ...COPY[phase], data: { url: '/', nightOf, phase } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    }
  }
}
