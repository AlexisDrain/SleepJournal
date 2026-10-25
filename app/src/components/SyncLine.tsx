// The sync part of the status line under the date: "Last synced today, 3:41 PM". The time is this
// device's own last sync. Nothing when no Google Sheet is connected.
import { useSheetSync } from '@/lib/useSync';
import { addDays, formatClock, shortDate, toDateString } from '@/lib/time';

export function lastSyncedLabel(iso: string): string {
  const day = toDateString(new Date(iso));
  const today = toDateString(new Date());
  const when = day === today ? 'today' : day === addDays(today, -1) ? 'yesterday' : shortDate(day);
  return `Last synced ${when}, ${formatClock(iso)}`;
}

/** The text to add after "Saved ✓" (Journal) or "Ticks save automatically" (Routines), or null. */
export function useSyncText(): string | null {
  const { connected, lastSyncAt, status } = useSheetSync();
  if (!connected) return null;
  return status === 'syncing' ? 'Syncing…'
    : status === 'failed' ? 'Last sync failed'
    : lastSyncAt ? lastSyncedLabel(lastSyncAt) : 'Not synced yet';
}

/** Joins the parts of the status line with a dot. */
export const joinStatus = (...parts: (string | null)[]) => parts.filter(Boolean).join('  ·  ');
