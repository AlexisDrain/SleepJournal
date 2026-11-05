// CBT-I's two extra morning questions, as Morning routine items: add them, or take them away again.
// Removing one hides it (like Hide in Routines), so the nights already answered keep their answers,
// and adding it again brings the same item back. Opened from Stats and from Settings → Advanced.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Panel } from '@/components/Panel';
import { Button, ErrorBox, Muted } from '@/components/ui';
import { store } from '@/db/store';
import { requestSync } from '@/db/sync';
import { addCbtiQuestion, CBTI_LABELS, cbtiShown, NO_SOURCES, removeCbtiQuestion, resolveCbtiSources, setCbtiQuestions, type CbtiSources } from '@/lib/cbti';
import { colors, space } from '@/lib/theme';
import type { RoutineItem } from '@/lib/types';

const KEYS = Object.keys(CBTI_LABELS) as (keyof CbtiSources)[];

export function CbtiPanel({ visible, onClose, onChanged }: {
  visible: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [sources, setSources] = useState<CbtiSources>(NO_SOURCES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const its = await store.routine.list();
    setSources(await resolveCbtiSources(its));
    setItems(its);
  }, []);
  useEffect(() => {
    if (!visible) return;
    setError(null);
    load().catch((e) => setError((e as Error).message));
  }, [visible, load]);

  const itemFor = (k: keyof CbtiSources) => items.find((i) => i.uid === sources[k]);
  const shown = (k: keyof CbtiSources) => cbtiShown(items, sources, k);
  const missing = KEYS.filter((k) => !shown(k));
  const act = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
      requestSync(); // to the Google Sheet, if connected
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>CBT-I questions</Text>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: space.md }}>
        <Muted>
          The sleep diary used in CBT-I (therapy for insomnia) asks two things the Journal doesn’t: how many times you
          woke in the night, and how long you were awake in all. They go in your Morning routine (marked
          <Text style={{ color: colors.morning }}> ★</Text>), and Stats shows them night by night. Hours asleep in Stats
          (and the report) then leave out the time awake.
        </Muted>
        {error && <ErrorBox message={error} />}
        {missing.length === 2 && <Button title="Add both" busy={busy} onPress={act(() => setCbtiQuestions(true))} />}
        {KEYS.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>
              <Text style={{ color: colors.morning }}>★ </Text>{itemFor(k)?.label ?? CBTI_LABELS[k]}
            </Text>
            {shown(k)
              ? <Button title="Remove this" small busy={busy} color={colors.chip} textColor={colors.danger} onPress={act(() => removeCbtiQuestion(k))} />
              : <Button title="Add this" small busy={busy} color={colors.chip} textColor={colors.text} onPress={act(() => addCbtiQuestion(k))} />}
          </View>
        ))}
        <Muted>Removing one hides it: nights you already answered keep their answers.</Muted>
      </ScrollView>
      <Button title="Close" small onPress={onClose} color={colors.chip} textColor={colors.text} />
    </Panel>
  );
}
