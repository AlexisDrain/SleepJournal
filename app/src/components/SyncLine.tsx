// The sync part of the status line under the date: "Last synced today, 3:41 PM", or "1 night waiting
// to sync" when edits here haven't reached the sheet yet. The time is this device's own last sync.
// Nothing when no Google Sheet is connected.
import { useEffect, useState } from 'react';
import { store } from '@/db/store';
import { onSyncRequested } from '@/db/sync';
import { useSheetSync } from '@/lib/useSync';
import { addDays, formatClock, shortDate, toDateString } from '@/lib/time';

export function lastSyncedLabel(iso: string): string {
  const day = toDateString(new Date(iso));
  const today = toDateString(new Date());
  const when = day === today ? 'today' : day === addDays(today, -1) ? 'yesterday' : shortDate(day);
  return `Last synced ${when}, ${formatClock(iso)}`;
}

export const waitingLabel = (nights: number) => `${nights} ${nights === 1 ? 'night' : 'nights'} waiting to sync`;

/** The text to add after "Saved ✓" (Journal) or "Ticks save automatically" (Routines), or null. */
export function useSyncText(): string | null {
  const { connected, lastSyncAt, status } = useSheetSync();
  const [waiting, setWaiting] = useState(0);
  // Look again after each save (it asks for a sync) and each time a sync starts or ends.
  useEffect(() => {
    const look = () => void store.unsyncedFields().then((nights) => setWaiting(nights.size), () => {});
    look();
    return onSyncRequested(look);
  }, [status, lastSyncAt]);
  if (!connected) return null;
  return status === 'syncing' ? 'Syncing…'
    : status === 'failed' ? joinStatus('Last sync failed', waiting ? waitingLabel(waiting) : null)
    : waiting ? waitingLabel(waiting)
    : lastSyncAt ? lastSyncedLabel(lastSyncAt) : 'Not synced yet';
}

/** Joins the parts of the status line with a dot. */
export const joinStatus = (...parts: (string | null)[]) => parts.filter(Boolean).join('  ·  ');
