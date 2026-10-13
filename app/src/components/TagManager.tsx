// Manage the list of tags: add one, hide one (it stays on the nights that already have it) or
// delete one (it's removed from past nights too), and bring hidden ones back.
// Used in Routines → Edit and from the Journal's Tags card.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { store } from '@/db/store';
import { requestSync } from '@/db/sync';
import { confirmAction } from '@/lib/confirm';
import { colors, space } from '@/lib/theme';
import type { Tag } from '@/lib/types';
import { Button, Chip, ErrorBox, Input, Muted, styles } from './ui';

export function TagManager({ onChanged }: { onChanged?: () => void }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [picked, setPicked] = useState<Tag | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => store.tags.list().then(setTags, (e) => setError((e as Error).message)), []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setPicked(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const add = () => {
    const name = draft.trim().toLowerCase();
    setDraft('');
    if (name) run(() => store.tags.create({ name })); // a hidden tag with this name comes back instead
  };
  const remove = async (t: Tag) => {
    if (await confirmAction(`Delete tag “${t.name}”?`, 'It will also be removed from past nights. To keep it there, hide it instead.', 'Delete')) {
      await run(() => store.tags.remove(t.id));
      requestSync(); // the nights that had it changed
    }
  };

  const shown = tags.filter((t) => !t.archived);
  const hidden = tags.filter((t) => t.archived);

  return (
    <View style={{ gap: space.md }}>
      <Muted>One-tap labels for a night, like insomnia or good dream. Tap one to hide or delete it.</Muted>
      {error && <ErrorBox message={error} />}
      <View style={styles.chips}>
        {shown.map((t) => (
          <Chip key={t.id} label={t.name} selected={picked?.id === t.id} color={colors.morning}
            onPress={() => setPicked(picked?.id === t.id ? null : t)} />
        ))}
      </View>
      {shown.length === 0 && <Muted>No tags showing.</Muted>}

      {picked && (
        <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: 10, padding: space.md }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>“{picked.name}”</Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Button title="Hide" small color={colors.chip} textColor={colors.text}
                onPress={() => run(() => store.tags.update(picked.id, { archived: true }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Delete" small color={colors.danger} onPress={() => remove(picked)} />
            </View>
          </View>
          <Muted>Hide: off the list, but it stays on the nights that have it. Delete: removed from past nights too.</Muted>
        </View>
      )}

      <Input placeholder="+ New tag" value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" />

      {hidden.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Pressable onPress={() => setShowHidden(!showHidden)} hitSlop={8}>
            <Muted>{showHidden ? '▴' : '▾'} {hidden.length} hidden tag{hidden.length > 1 ? 's' : ''} (tap one to bring it back)</Muted>
          </Pressable>
          {showHidden && (
            <View style={styles.chips}>
              {hidden.map((t) => (
                <Chip key={t.id} label={`${t.name}  ↩`} onPress={() => run(() => store.tags.update(t.id, { archived: false }))} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
