// Web version: browsers can't schedule reminders like a phone can, so reminders are phone-only.
// Same exports as notifications.ts, doing nothing.
import type { Phase } from './types';

export const remindersSupported = false;

export interface Reminder {
  phase: Phase;
  hour: number;
  minute: number;
}

export function useReminderTap(_enabled: boolean) {}
export async function ensurePermission(): Promise<boolean> {
  return false;
}
export async function getReminders(): Promise<Partial<Record<Phase, Reminder>>> {
  return {};
}
export async function setReminder(_r: Reminder): Promise<void> {}
export async function clearReminder(_phase: Phase): Promise<void> {}
export async function syncReminders(): Promise<void> {}
