// What the Google Sheet sync is doing, for screens to show: whether a sheet is connected, whether
// a sync is running right now, and when this device last synced.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getConnection, getSyncState, getSyncStatus, onSyncStatus, type SyncStatus } from '@/db/sync';

/** 'idle' until the first sync of this session starts, then 'syncing', then 'done' or 'failed'. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(onSyncStatus, getSyncStatus, getSyncStatus);
}

/** Whether this device is connected to a Google Sheet, and when it last synced (ISO time, or null). */
export function useSheetSync(): { connected: boolean; lastSyncAt: string | null; status: SyncStatus } {
  const status = useSyncStatus();
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const read = useCallback(() => {
    getConnection().then((c) => setConnected(!!c), () => setConnected(false));
    getSyncState().then((s) => setLastSyncAt(s.lastSyncAt), () => {});
  }, []);
  // Connecting happens in Settings, so look again when the screen is shown, and after every sync.
  useFocusEffect(read);
  useEffect(read, [status, read]);
  return { connected, lastSyncAt, status };
}
