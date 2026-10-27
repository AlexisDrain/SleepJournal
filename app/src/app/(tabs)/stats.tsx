// Stats: the essentials of your sleep for a period: averages, a chart of hours asleep, the most
// used tags, and night by night the times, tags and notes. Exportable on its own.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { exportStats } from '@/db/csv';
import { store } from '@/db/store';
import { onPulled } from '@/db/sync';
import { useHour24 } from '@/lib/clockFormat';
import { useThemeName } from '@/lib/displayMode';
import { formatAfterMidnight, formatAfterNoon, summarize } from '@/lib/stats';
import { colors, radius, space } from '@/lib/theme';
import { addDays, currentNight, dayLabel, formatClock } from '@/lib/time';
import { page, useWide, WIDE_PAGE, NARROW_PAGE } from '@/lib/useLayout';
import type { Entry } from '@/lib/types';

const PERIODS: { label: string; nights: number | null }[] = [
  { label: '7 nights', nights: 7 },
  { label: '30 nights', nights: 30 },
  { label: '90 nights', nights: 90 },
  { label: 'All', nights: null },
];
const CHART_NIGHTS = 60; // more bars than this get too thin to read
const CHART_HEIGHT = 120;

export default function StatsScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  useHour24();
  const wide = useWide();
  const [period, setPeriod] = useState(1);
  const [entries, setEntries] = useState<Entry[]>([]); // newest first
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const nights = PERIODS[period].nights;
  const from = nights === null ? undefined : addDays(currentNight(), -(nights - 1));
  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await store.listEntries({ from, limit: 100_000 }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from]);
  useFocusEffect(useCallback(() => void load(), [load]));
  useEffect(() => onPulled(() => void load()), [load]);

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      await exportStats(format, from);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const s = summarize(entries);
  const shown = entries.filter((e) => e.hoursAsleep !== null || e.triedSleepAt || e.inBedAt || e.dayStartedAt || e.wokeAt || e.tags.length || e.bedtimeNote || e.morningNote);

  const header = (
    <View style={{ gap: space.md }}>
      {/* Phones have no room for these in the bottom bar, so they open from here. */}
      {!wide && (
        <Card title="More from your journal">
          <Button title="☁ Dreams" color={colors.chip} textColor={colors.text} onPress={() => router.navigate('/dreams')} />
          <Muted>Every dream you wrote down, to read back.</Muted>
          <Button title="▦ Sheet" color={colors.chip} textColor={colors.text} onPress={() => router.navigate('/sheet')} />
          <Muted>The whole journal as a spreadsheet.</Muted>
        </Card>
      )}
      <View style={[styles.chips, { justifyContent: 'center' }]}>
        {PERIODS.map((p, i) => <Chip key={p.label} label={p.label} selected={i === period} onPress={() => setPeriod(i)} />)}
      </View>
      {error && <ErrorBox message={error} onRetry={load} />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Tile label="Hours asleep" value={s.avgHours === null ? '—' : `${s.avgHours} h`} note="average" color={colors.success} />
        <Tile label="Tried to sleep" value={s.avgTriedMin === null ? '—' : formatAfterNoon(s.avgTriedMin)} note="average" color={colors.night} />
        <Tile label="Started day" value={s.avgStartedMin === null ? '—' : formatAfterMidnight(s.avgStartedMin)} note="average" color={colors.morning} />
        <Tile label="Nights" value={String(s.nights)} note={nights ? `of the last ${nights}` : 'recorded'} color={colors.muted} />
      </View>

      <HoursChart entries={entries} average={s.avgHours} />

      {s.tags.length > 0 && (
        <Card title="Tags">
          <View style={styles.chips}>
            {s.tags.map((t) => <Chip key={t.name} label={`${t.name} ×${t.count}`} />)}
          </View>
        </Card>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text style={[styles.cardTitle, { flex: 1 }]}>Night by night</Text>
        <Button title="Export .xlsx" small busy={exporting} color={colors.chip} textColor={colors.text} onPress={() => exportAs('xlsx')} />
        <Button title="CSV" small busy={exporting} color={colors.chip} textColor={colors.text} onPress={() => exportAs('csv')} />
      </View>
      <Muted>The export has these nights with hours asleep, tried to sleep, started day, tags and notes.</Muted>
      {shown.length > 0 && <TableHeader wide={wide} />}
    </View>
  );

  if (loading) return <View style={styles.screen}><ActivityIndicator color={colors.night} style={{ marginTop: space.xl }} /></View>;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.scroll, page(wide ? WIDE_PAGE : NARROW_PAGE)]}
      data={shown}
      keyExtractor={(e) => e.nightOf}
      ListHeaderComponent={<View style={{ marginBottom: space.md }}>{header}</View>}
      ListEmptyComponent={<Muted>{entries.length ? 'No times, tags or notes in this period yet.' : 'No nights in this period yet.'}</Muted>}
      renderItem={({ item, index }) => <NightRow e={item} wide={wide} odd={index % 2 === 1} last={index === shown.length - 1} />}
    />
  );
}

function Tile({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderRadius: radius, borderWidth: 1,
      borderColor: colors.cardBorder, borderLeftWidth: 3, borderLeftColor: color, padding: space.md, gap: 2,
    }}>
      <Text style={styles.cardTitle}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Muted>{note}</Muted>
    </View>
  );
}

/** One bar per night (oldest on the left), with a line at the average. */
function HoursChart({ entries, average }: { entries: Entry[]; average: number | null }) {
  const nights = entries.slice(0, CHART_NIGHTS).reverse();
  const hours = nights.map((e) => e.hoursAsleep);
  const known = hours.filter((h): h is number => h !== null && h > 0);
  if (known.length < 2) return null;
  const top = Math.max(10, Math.ceil(Math.max(...known)));
  const y = (h: number) => (Math.max(0, h) / top) * CHART_HEIGHT;
  return (
    <Card title={`Hours asleep${entries.length > CHART_NIGHTS ? ` · last ${CHART_NIGHTS} nights` : ''}`}>
      <View style={{ height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {hours.map((h, i) => (
          <View key={nights[i].nightOf} style={{
            flex: 1, height: h === null ? 2 : Math.max(2, y(h)), borderRadius: 2,
            backgroundColor: h === null ? colors.cardBorder : h < 0 ? colors.danger : colors.night,
          }} />
        ))}
        {average !== null && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: y(average), borderTopWidth: 1, borderColor: colors.success }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Muted>{dayLabel(nights[0].nightOf)}</Muted>
        {average !== null && <Text style={{ color: colors.success, fontSize: 12 }}>— average {average} h</Text>}
        <Muted>{dayLabel(nights[nights.length - 1].nightOf)}</Muted>
      </View>
      <Muted>Scale 0 to {top} h. A grey stub is a night without hours asleep; red means the times don't add up.</Muted>
    </Card>
  );
}

// ---------- the night-by-night table ----------
// Wide screens: one line per night, all six columns. Phones: the four short columns on the line,
// with tags and notes on a second line underneath, so nothing has to scroll sideways.

const COLS = { night: 1.4, hours: 0.7, tried: 1, started: 1, tags: 1.4, notes: 2.6 };
const cellText = { color: colors.text, fontSize: 14 } as const;

function TableHeader({ wide }: { wide: boolean }) {
  const h = (label: string, flex: number, right?: boolean) => (
    <Text style={[styles.cardTitle, { flex, fontSize: 11, textAlign: right ? 'right' : 'left' }]}>{label}</Text>
  );
  return (
    <View style={{
      flexDirection: 'row', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginTop: space.sm,
      backgroundColor: colors.chip, borderTopLeftRadius: radius, borderTopRightRadius: radius,
    }}>
      {h('Night', COLS.night)}
      {h('Hours', COLS.hours, true)}
      {h('Tried to sleep', COLS.tried)}
      {h('Started day', COLS.started)}
      {wide && h('Tags', COLS.tags)}
      {wide && h('Notes', COLS.notes)}
    </View>
  );
}

function NightRow({ e, wide, odd, last }: { e: Entry; wide: boolean; odd: boolean; last: boolean }) {
  const tried = e.triedSleepAt ?? e.inBedAt;
  const started = e.dayStartedAt ?? e.wokeAt;
  const notes = [e.bedtimeNote, e.morningNote].filter(Boolean).join(' · ');
  const tags = e.tags.join(', ');
  const [y, m, d] = e.nightOf.split('-').map(Number);
  const night = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={{
      paddingHorizontal: space.md, paddingVertical: space.sm, gap: 4,
      backgroundColor: odd ? colors.bg : colors.card,
      borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder,
      ...(last ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null),
    }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <Text style={[cellText, { flex: COLS.night, fontWeight: '600' }]}>{night}</Text>
        <Text style={[cellText, {
          flex: COLS.hours, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '700',
          color: e.hoursAsleep === null ? colors.muted : e.hoursAsleep < 0 ? colors.danger : colors.success,
        }]}>{e.hoursAsleep === null ? '—' : e.hoursAsleep}</Text>
        <Text style={[cellText, { flex: COLS.tried, fontVariant: ['tabular-nums'] }]}>{tried ? formatClock(tried) : '—'}</Text>
        <Text style={[cellText, { flex: COLS.started, fontVariant: ['tabular-nums'] }]}>{started ? formatClock(started) : '—'}</Text>
        {wide && <Text style={[cellText, { flex: COLS.tags, color: colors.muted }]}>{tags}</Text>}
        {wide && <Text selectable style={[cellText, { flex: COLS.notes }]}>{notes}</Text>}
      </View>
      {!wide && (tags || notes) ? (
        <Text selectable style={{ color: colors.muted, fontSize: 13 }}>
          {tags ? <Text style={{ color: colors.text }}>{tags}</Text> : null}{tags && notes ? '  ·  ' : ''}{notes}
        </Text>
      ) : null}
    </View>
  );
}
