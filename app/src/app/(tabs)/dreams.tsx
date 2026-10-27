// Dreams: every dream you wrote down, newest first, to read like a diary. Search by word, or
// let the app pick one at random.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, ErrorBox, Input, Muted, styles } from '@/components/ui';
import { store } from '@/db/store';
import { onPulled } from '@/db/sync';
import { useThemeName } from '@/lib/displayMode';
import { colors, space } from '@/lib/theme';
import { addDays, dayLabel } from '@/lib/time';
import { NARROW_PAGE, page } from '@/lib/useLayout';
import type { Entry } from '@/lib/types';

export default function DreamsScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const [dreams, setDreams] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDreams((await store.listEntries({ limit: 100_000 })).filter((e) => e.dream?.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));
  useEffect(() => onPulled(() => void load()), [load]);

  const words = query.trim().toLowerCase();
  const shown = useMemo(() => (words ? dreams.filter((d) => d.dream!.toLowerCase().includes(words)) : dreams), [dreams, words]);

  const surprise = () => {
    if (!dreams.length) return;
    let next = dreams[Math.floor(Math.random() * dreams.length)];
    if (dreams.length > 1 && next === picked) next = dreams[(dreams.indexOf(next) + 1) % dreams.length];
    setPicked(next);
  };

  if (loading) return <View style={styles.screen}><ActivityIndicator color={colors.night} style={{ marginTop: space.xl }} /></View>;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.scroll, page(NARROW_PAGE), { gap: space.md }]}
      data={shown}
      keyExtractor={(e) => e.nightOf}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          {error && <ErrorBox message={error} onRetry={load} />}
          <Muted>
            {dreams.length === 0 ? 'No dreams yet. Write one in the Journal\'s Morning section and it shows up here.'
              : `${dreams.length} dream${dreams.length === 1 ? '' : 's'} written down${words ? ` · ${shown.length} with “${query.trim()}”` : ''}.`}
          </Muted>
          {dreams.length > 0 && (
            <>
              <Input placeholder="Search your dreams" value={query} onChangeText={setQuery} autoCorrect={false} />
              <Button title="✦ Read a random dream" small color={colors.chip} textColor={colors.text} onPress={surprise} />
              {picked && <DreamCard e={picked} highlight />}
            </>
          )}
        </View>
      }
      renderItem={({ item }) => <DreamCard e={item} />}
    />
  );
}

/** A dream is from the morning after its night: "Sunday, Oct 25" for the night of Saturday. */
function DreamCard({ e, highlight }: { e: Entry; highlight?: boolean }) {
  return (
    <View style={[styles.card, { marginBottom: 0, gap: space.sm }, highlight && { borderColor: colors.night, borderWidth: 2 }]}>
      <Text style={{ color: colors.night, fontWeight: '700' }}>☁ {dayLabel(addDays(e.nightOf, 1))}</Text>
      <Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{e.dream}</Text>
      {e.tags.length > 0 && <Muted>{e.tags.join(' · ')}</Muted>}
    </View>
  );
}
