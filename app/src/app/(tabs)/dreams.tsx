// Dreams: every dream you wrote down, newest first, to read like a diary. Search by word, or
// let the app pick one at random. A long dream shows its beginning, with a button to read the rest.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, ErrorBox, Input, Muted, styles } from '@/components/ui';
import { store } from '@/db/store';
import { onPulled } from '@/db/sync';
import { usePullToSync } from '@/lib/usePullToSync';
import { useThemeName } from '@/lib/displayMode';
import { colors, space } from '@/lib/theme';
import { addDays, dayLabel } from '@/lib/time';
import { NARROW_PAGE, page } from '@/lib/useLayout';
import type { Entry } from '@/lib/types';

export default function DreamsScreen() {
  const pullControl = usePullToSync();
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
      refreshControl={pullControl}
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
              {picked && <DreamCard key={picked.nightOf} e={picked} highlight />}
            </>
          )}
        </View>
      }
      // While searching, dreams show in full: the word found may be past the beginning.
      renderItem={({ item }) => <DreamCard e={item} full={!!words} />}
    />
  );
}

const PREVIEW_CHARS = 600;
const PREVIEW_LINES = 10;

/** The beginning of a long dream (ending at a word, with "…"), or null when it's short enough to show whole. */
function beginning(text: string): string | null {
  const lines = text.split('\n');
  if (text.length <= PREVIEW_CHARS && lines.length <= PREVIEW_LINES) return null;
  let cut = lines.slice(0, PREVIEW_LINES).join('\n');
  if (cut.length > PREVIEW_CHARS) {
    cut = cut.slice(0, PREVIEW_CHARS);
    const space = cut.lastIndexOf(' ');
    if (space > PREVIEW_CHARS * 0.8) cut = cut.slice(0, space);
  }
  return cut.trimEnd() + '…';
}

/** A dream is from the morning after its night: "Sunday, Oct 25" for the night of Saturday. */
function DreamCard({ e, highlight, full }: { e: Entry; highlight?: boolean; full?: boolean }) {
  const [open, setOpen] = useState(false);
  const short = full ? null : beginning(e.dream!);
  return (
    <View style={[styles.card, { marginBottom: 0, gap: space.sm }, highlight && { borderColor: colors.night, borderWidth: 2 }]}>
      <Text style={{ color: colors.night, fontWeight: '700' }}>☁ {dayLabel(addDays(e.nightOf, 1))}</Text>
      <Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{short && !open ? short : e.dream}</Text>
      {short && (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button title={open ? 'Show less' : 'Read the rest'} small color={colors.chip} textColor={colors.text} onPress={() => setOpen((o) => !o)} />
        </View>
      )}
      {e.tags.length > 0 && <Muted>{e.tags.join(' · ')}</Muted>}
    </View>
  );
}
