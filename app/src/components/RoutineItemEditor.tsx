import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { store } from '@/db/store';
import type { Phase, RoutineItem } from '@/lib/types';
import { colors, space } from '@/lib/theme';
import { Panel } from './Panel';
import { Button, Chip, Input, Muted, styles } from './ui';

export const KIND_LABEL: Record<RoutineItem['kind'], string> = {
  check: 'nothing',
  time: '⏱ time',
  number: '# number',
  text: 'Aa note',
};
const PHASE_COLOR: Record<Phase, string> = { bedtime: colors.night, morning: colors.morning };

/** Bottom sheet to rename a routine item, change what it records, move it, or hide it. */
export function RoutineItemEditor({ item, onClose, onSaved }: {
  item: RoutineItem | null; // null = closed
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<RoutineItem['kind']>('check');
  const [phase, setPhase] = useState<Phase>('bedtime');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setLabel(item.label);
    setKind(item.kind);
    setPhase(item.phase);
    setError(null);
  }, [item]);

  const run = (patch: Partial<RoutineItem>) => async () => {
    if (!item) return;
    setBusy(true);
    try {
      await store.routine.update(item.id, patch);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accent = PHASE_COLOR[phase];
  return (
    <Panel visible={item !== null} onClose={onClose}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Edit routine item</Text>
          <Input value={label} onChangeText={setLabel} placeholder="Label" autoFocus={false} />
          <Muted>Checking it off also records:</Muted>
          <View style={styles.chips}>
            {(Object.keys(KIND_LABEL) as RoutineItem['kind'][]).map((k) => (
              <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} color={accent} />
            ))}
          </View>
          <Muted>Part of:</Muted>
          <View style={styles.chips}>
            <Chip label="☾ bedtime" selected={phase === 'bedtime'} onPress={() => setPhase('bedtime')} color={colors.night} />
            <Chip label="☀ morning" selected={phase === 'morning'} onPress={() => setPhase('morning')} color={colors.morning} />
          </View>
          {item && kind !== item.kind && (
            <Muted>Past nights keep what they recorded before the change.</Muted>
          )}
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          <Button title="Save" busy={busy} color={accent} disabled={!label.trim()}
            onPress={run({ label: label.trim(), kind, phase })} />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Button title="Hide item" small color={colors.chip} textColor={colors.danger} onPress={run({ archived: true })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" small color={colors.chip} textColor={colors.text} onPress={onClose} />
            </View>
          </View>
    </Panel>
  );
}
