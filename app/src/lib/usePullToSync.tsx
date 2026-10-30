import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import { getConnection, syncNow } from '@/db/sync';
import { colors } from './theme';

/** Pull down from the top of a list to sync with the Google Sheet. Phones only, once connected. */
export function usePullToSync() {
  const [connected, setConnected] = useState(false);
  const [pulling, setPulling] = useState(false);
  useFocusEffect(useCallback(() => {
    getConnection().then((c) => setConnected(!!c), () => {});
  }, []));
  const pull = useCallback(() => {
    setPulling(true);
    syncNow().catch(() => {}).finally(() => setPulling(false)); // a failed sync shows in Settings
  }, []);
  if (!connected || Platform.OS === 'web') return undefined;
  return <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={colors.night} colors={[colors.night]} />;
}
