// "⟳ Sync" next to Swap on the Journal and Routines tabs: sync with the Google Sheet right now
// instead of waiting for the automatic sync. Only shown when a sheet is connected.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getConnection, syncNow } from '@/db/sync';
import { Chip } from './ui';

type State = 'idle' | 'busy' | 'done' | 'failed';
const LABEL: Record<State, string> = { idle: '⟳ Sync', busy: 'Syncing…', done: 'Synced ✓', failed: 'Sync failed' };

export function SyncChip() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<State>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Connecting or disconnecting happens in Settings, so look again whenever this tab is shown.
  useFocusEffect(useCallback(() => {
    getConnection().then((c) => setConnected(!!c), () => setConnected(false));
  }, []));
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);

  if (!connected) return null;

  const run = async () => {
    if (reset.current) clearTimeout(reset.current);
    setState('busy');
    try {
      await syncNow(); // screens showing changed nights refresh themselves (onPulled)
      setState('done');
    } catch {
      setState('failed'); // the reason is shown in Settings → Google Sheet
    }
    reset.current = setTimeout(() => setState('idle'), 3000);
  };

  return <Chip label={LABEL[state]} selected={state === 'busy'} onPress={state === 'busy' ? undefined : run} />;
}
