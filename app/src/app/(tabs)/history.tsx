import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { RESTED_LABELS } from '@/components/inputs';
import { Card, ErrorBox, Muted, styles } from '@/components/ui';
import { store } from '@/db/store';
import type { Entry, Stats } from '@/lib/types';
import { colors, space } from '@/lib/theme';
import { NARROW_PAGE, page, useWide, WIDE_PAGE } from '@/lib/useLayout';
import { addDays, formatClock, formatDuration, formatMinutesFrom, shortDate } from '@/lib/time';

const PAGE = 60;

export default function HistoryScreen() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const wide = useWide();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [e, s] = await Promise.all([store.listEntries({ limit: PAGE }), store.stats(30)]);
      setEntries(e);
      setStats(s);
      setDone(e.length < PAGE);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whenever the tab is opened, so edits from Tonight/Morning show up.
  useFocusEffect(useCallback(() => void load(), [load]));

  const loadMore = async () => {
    if (done || !entries.length) return;
    const to = addDays(entries[entries.length - 1].nightOf, -1);
    const more = await store.listEntries({ to, limit: PAGE });
    setEntries((e) => [...e, ...more]);
    setDone(more.length < PAGE);
  };

  if (loading) return <View style={[styles.screen, { justifyContent: 'center' }]}><ActivityIndicator color={colors.night} /></View>;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.scroll, page(wide ? WIDE_PAGE : NARROW_PAGE)]}
      key={wide ? 'two-columns' : 'one-column'} // FlatList can't change column count in place
      numColumns={wide ? 2 : 1}
      columnWrapperStyle={wide ? { gap: space.md } : undefined}
      data={entries}
      keyExtractor={(e) => e.nightOf}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.muted} />}
      onEndReached={loadMore}
      ListHeaderComponent={
        <>
          {error && <ErrorBox message={error} onRetry={load} />}
          {stats && <StatsCard stats={stats} wide={wide} />}
        </>
      }
      ListEmptyComponent={error ? null : <Muted>No nights logged yet.</Muted>}
      renderItem={({ item }) => <View style={{ flex: 1, maxWidth: wide ? '49.4%' : undefined }}><EntryRow entry={item} /></View>}
    />
  );
}

function StatsCard({ stats, wide }: { stats: Stats; wide: boolean }) {
  const cell = (label: string, value: string) => (
    <View style={{ width: wide ? '16.66%' : '50%', paddingVertical: space.xs }}>
      <Muted>{label}</Muted>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{value}</Text>
    </View>
  );
  return (
    <Card title={`Last ${stats.days} days · ${stats.nights} nights`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cell('Tried to sleep', formatMinutesFrom('noon', stats.avgTriedSleepMinAfterNoon))}
        {cell('Woke up', formatMinutesFrom('midnight', stats.avgWokeMinAfterMidnight))}
        {cell('Started day', formatMinutesFrom('midnight', stats.avgDayStartedMinAfterMidnight))}
        {cell('Hours asleep', stats.avgHoursAsleep === null ? '—' : `${stats.avgHoursAsleep}h`)}
        {cell('Fall asleep in', formatDuration(stats.avgLatencyMin))}
        {cell('Rested', stats.avgRested === null ? '—' : `${stats.avgRested} / 5`)}
      </View>
      {stats.tagCounts.length > 0 && (
        <Muted>{stats.tagCounts.slice(0, 6).map((t) => `${t.name} ×${t.count}`).join('   ')}</Muted>
      )}
    </Card>
  );
}

function EntryRow({ entry: e }: { entry: Entry }) {
  const open = () => router.navigate({ pathname: '/', params: { night: e.nightOf } });
  return (
    <Pressable onPress={open}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {e.weekday.slice(0, 3)} · {shortDate(e.nightOf)}
          </Text>
          <Text style={{ color: colors.morning }}>
            {e.rested ? RESTED_LABELS[e.rested - 1] : ''}
          </Text>
        </View>
        <Text style={{ color: colors.muted }}>
          <Text style={{ color: colors.night }}>{formatClock(e.triedSleepAt)}</Text>
          {'  →  '}
          <Text style={{ color: colors.morning }}>{formatClock(e.wokeAt)}</Text>
          {e.hoursAsleep !== null ? `   ${e.hoursAsleep}h asleep` : ''}
          {e.sleepLatencyMin !== null ? ` · ${formatDuration(e.sleepLatencyMin)} to fall asleep` : ''}
        </Text>
        {(e.tags.length > 0 || e.bedtimeNote || e.morningNote) && (
          <Muted>{[e.tags.join(', '), e.bedtimeNote, e.morningNote].filter(Boolean).join(' — ')}</Muted>
        )}
      </Card>
    </Pressable>
  );
}
