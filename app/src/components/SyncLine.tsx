// "Last synced today, 3:41 PM" under the Sync button (Journal and Routines). The time is this
// device's own last sync. Shows nothing when no Google Sheet is connected.
import { Text } from 'react-native';
import { useSheetSync } from '@/lib/useSync';
import { colors, space } from '@/lib/theme';
import { addDays, formatClock, shortDate, toDateString } from '@/lib/time';

export function lastSyncedLabel(iso: string): string {
  const day = toDateString(new Date(iso));
  const today = toDateString(new Date());
  const when = day === today ? 'today' : day === addDays(today, -1) ? 'yesterday' : shortDate(day);
  return `Last synced ${when}, ${formatClock(iso)}`;
}

export function SyncLine() {
  const { connected, lastSyncAt, status } = useSheetSync();
  if (!connected) return null;
  const text = status === 'syncing' ? 'Syncing…'
    : status === 'failed' ? 'Last sync failed (see Settings → Google Sheet)'
    : lastSyncAt ? lastSyncedLabel(lastSyncAt) : 'Not synced yet';
  return (
    <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: -space.sm, marginBottom: space.md }}>
      {text}
    </Text>
  );
}
