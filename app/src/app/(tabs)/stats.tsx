// Stats: the essentials of your sleep for a period: averages, a chart of hours asleep, the most
// used tags, and night by night the times, tags and notes. Exportable on its own.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Panel } from '@/components/Panel';
import { Button, Card, Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { exportStats } from '@/db/csv';
import { store } from '@/db/store';
import { onPulled } from '@/db/sync';
import { useHour24 } from '@/lib/clockFormat';
import { useThemeName } from '@/lib/displayMode';
import { formatAfterMidnight, formatAfterNoon, summarize } from '@/lib/stats';
import { colors, radius, space } from '@/lib/theme';
import { loadHiddenStatsColumns, saveHiddenStatsColumns } from '@/lib/statsPrefs';
import { addDays, currentNight, dayLabel, formatClock, formatDuration } from '@/lib/time';
import { page, useWide, WIDE_PAGE, NARROW_PAGE } from '@/lib/useLayout';
import type { Entry } from '@/lib/types';

const PERIODS: { label: string; nights: number | null }[] = [
  { label: '7 nights', nights: 7 },
  { label: '30 nights', nights: 30 },
  { label: '90 nights', nights: 90 },
  { label: '1 year', nights: 365 },
  { label: 'All', nights: null },
];
const CHART_NIGHTS = 60; // more bars than this get too thin to read
const CHART_HEIGHT = 120;
const ROW_BATCH = 100; // rows a phone draws at a time in the night-by-night table

export default function StatsScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  useHour24();
  const wide = useWide();
  const [period, setPeriod] = useState(1);
  const [year, setYear] = useState<string | null>(null); // a calendar year instead of a period
  const [years, setYears] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]); // newest first
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null); // a note or tags opened in full
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // columns switched off (saved on this device)
  useEffect(() => { loadHiddenStatsColumns().then(setHidden, () => {}); }, []);
  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    saveHiddenStatsColumns(next).catch(() => {});
  };
  const cols = COLUMNS.filter((c) => !hidden.has(c.id));

  const nights = year ? null : PERIODS[period].nights;
  // A year: its nights from Jan 1 to Dec 31. A period: the last N nights up to tonight.
  const from = year ? `${year}-01-01` : nights === null ? undefined : addDays(currentNight(), -(nights - 1));
  const to = year ? `${year}-12-31` : undefined;
  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, ys] = await Promise.all([store.listEntries({ from, to, limit: 100_000 }), store.years()]);
      setEntries(list);
      setYears(ys);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useFocusEffect(useCallback(() => void load(), [load]));
  useEffect(() => onPulled(() => void load()), [load]);

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      await exportStats(format, { from, to }, cols.flatMap((c) => c.exports));
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
      {/* Dreams and Sheet belong to Stats. On phones this card is the way to them (the bottom bar
          has no room); wide screens also have them in the menu, and show the two side by side. */}
      <Card title="More from your journal">
        <View style={wide ? { flexDirection: 'row', gap: space.md } : { gap: space.md }}>
          <View style={{ flex: wide ? 1 : undefined, gap: space.sm }}>
            <Button title="☁ Dreams" color={colors.chip} textColor={colors.text} onPress={() => router.navigate('/dreams')} />
            <Muted>Every dream you wrote down, to read back.</Muted>
          </View>
          <View style={{ flex: wide ? 1 : undefined, gap: space.sm }}>
            <Button title="▦ Sheet" color={colors.chip} textColor={colors.text} onPress={() => router.navigate('/sheet')} />
            <Muted>The whole journal as a spreadsheet.</Muted>
          </View>
        </View>
      </Card>
      <View style={[styles.chips, { justifyContent: 'center' }]}>
        {PERIODS.map((p, i) => <Chip key={p.label} label={p.label} selected={!year && i === period} onPress={() => { setYear(null); setPeriod(i); }} />)}
      </View>
      {/* One button per year with nights, to look back at a whole year on its own. */}
      {years.length > 1 && (
        <View style={[styles.chips, { justifyContent: 'center' }]}>
          {years.map((y) => <Chip key={y} label={y} selected={year === y} color={colors.morning} onPress={() => setYear(y)} />)}
        </View>
      )}
      {error && <ErrorBox message={error} onRetry={load} />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Tile label="Hours asleep" value={s.avgHours === null ? '—' : `${s.avgHours} h`} note="average" color={colors.success} />
        <Tile label="Tried to sleep" value={s.avgTriedMin === null ? '—' : formatAfterNoon(s.avgTriedMin)} note="average" color={colors.night} />
        <Tile label="Started day" value={s.avgStartedMin === null ? '—' : formatAfterMidnight(s.avgStartedMin)} note="average" color={colors.morning} />
        <Tile label="Nights" value={String(s.nights)} note={year ? `in ${year}` : nights ? `of the last ${nights}` : 'recorded'} color={colors.muted} />
      </View>

      <HoursChart entries={entries} average={s.avgHours} />

      {s.tags.length > 0 && (
        <Card title="Tags">
          <View style={styles.chips}>
            {s.tags.map((t) => <Chip key={t.name} label={`${t.name} ×${t.count}`} />)}
          </View>
        </Card>
      )}

      {/* On a phone the two buttons don't fit beside the heading: they wrap under it. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
        <Text style={[styles.cardTitle, { flexGrow: 1, flexBasis: 160 }]}>Night by night</Text>
        <Button title="Export .xlsx (recommended)" small busy={exporting} color={colors.chip} textColor={colors.text} onPress={() => exportAs('xlsx')} />
        <Button title="Export .csv" small busy={exporting} color={colors.chip} textColor={colors.text} onPress={() => exportAs('csv')} />
      </View>
      {/* Each column on or off: on screen and in the export alike. */}
      <View style={styles.chips}>
        {COLUMNS.map((c) => (
          <Chip key={c.id} label={`${hidden.has(c.id) ? '☐' : '☑'} ${c.label}`} selected={!hidden.has(c.id)} onPress={() => toggle(c.id)} />
        ))}
      </View>
      <Muted>Untick a column to hide it here and leave it out of the export. The export has the nights shown.</Muted>
      {shown.length > 0 && (wide ? <TableHeader cols={cols} /> : <SwipeTable entries={shown} cols={cols} onRead={setReading} />)}
    </View>
  );

  if (loading) return <View style={styles.screen}><ActivityIndicator color={colors.night} style={{ marginTop: space.xl }} /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.screen}
        contentContainerStyle={[styles.scroll, page(wide ? WIDE_PAGE : NARROW_PAGE)]}
        // Phones draw the whole table in the header (it scrolls sideways); wide screens list the rows.
        data={wide ? shown : []}
        keyExtractor={(e) => e.nightOf}
        ListHeaderComponent={<View style={{ marginBottom: space.md }}>{header}</View>}
        ListEmptyComponent={shown.length ? undefined : <Muted>{entries.length ? 'No times, tags or notes in this period yet.' : 'No nights in this period yet.'}</Muted>}
        renderItem={({ item, index }) => <NightRow e={item} cols={cols} odd={index % 2 === 1} last={index === shown.length - 1} onRead={setReading} />}
      />
      <Panel visible={reading !== null} onClose={() => setReading(null)}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{reading?.title}</Text>
        <Muted>Night of {reading ? dayLabel(reading.nightOf) : ''}</Muted>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>
          <Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{reading?.text}</Text>
        </ScrollView>
        <Button title="Close" small onPress={() => setReading(null)} color={colors.chip} textColor={colors.text} />
      </Panel>
    </View>
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
// Wide screens: columns share the width. Phones: columns keep a readable width and the table
// scrolls sideways, with ‹ › arrows showing there's more.

interface Col {
  id: string;
  label: string;
  /** Share of the width on wide screens. */
  flex: number;
  /** Width on phones (px). */
  width: number;
  right?: boolean;
  /** The export columns this one stands for. */
  exports: string[];
  cell: (e: Entry) => { text: string; color?: string; bold?: boolean };
}

const NIGHT_COL = { flex: 1.3, width: 104 };
const COLUMNS: Col[] = [
  { id: 'hours', label: 'Hours asleep', flex: 0.8, width: 70, right: true, exports: ['Hours asleep'],
    cell: (e) => ({ text: e.hoursAsleep === null ? '—' : String(e.hoursAsleep), bold: true,
      color: e.hoursAsleep === null ? colors.muted : e.hoursAsleep < 0 ? colors.danger : colors.success }) },
  { id: 'tried', label: 'Tried to sleep', flex: 1, width: 92, exports: ['Tried to sleep'],
    cell: (e) => { const t = e.triedSleepAt ?? e.inBedAt; return { text: t ? formatClock(t) : '—' }; } },
  { id: 'latency', label: 'To fall asleep', flex: 0.9, width: 92, exports: ['Minutes to fall asleep'],
    cell: (e) => ({ text: e.sleepLatencyMin === null ? '—' : formatDuration(e.sleepLatencyMin) }) },
  { id: 'started', label: 'Started day', flex: 1, width: 92, exports: ['Started day'],
    cell: (e) => { const t = e.dayStartedAt ?? e.wokeAt; return { text: t ? formatClock(t) : '—' }; } },
  { id: 'tags', label: 'Tags', flex: 1.4, width: 150, exports: ['Tags'],
    cell: (e) => ({ text: e.tags.join(', '), color: colors.muted }) },
  { id: 'notes', label: 'Notes', flex: 2.6, width: 260, exports: ['Bedtime note', 'Morning note'],
    cell: (e) => ({ text: [e.bedtimeNote, e.morningNote].filter(Boolean).join(' · ') }) },
];

const cellText = { color: colors.text, fontSize: 14 } as const;
const shortNight = (nightOf: string) => {
  const [y, m, d] = nightOf.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
/** Wide: share the width. Phone: a fixed width. */
const sized = (c: { flex: number; width: number }, fixed: boolean) => (fixed ? { width: c.width } : { flex: c.flex });

function HeaderRow({ cols, fixed }: { cols: Col[]; fixed: boolean }) {
  const h = (key: string, label: string, size: object, right?: boolean) => (
    <Text key={key} style={[styles.cardTitle, size, { fontSize: 11, textAlign: right ? 'right' : 'left' }]}>{label}</Text>
  );
  return (
    <View style={{
      flexDirection: 'row', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm,
      backgroundColor: colors.chip, borderTopLeftRadius: radius, borderTopRightRadius: radius,
    }}>
      {h('night', 'Night', sized(NIGHT_COL, fixed))}
      {cols.map((c) => h(c.id, c.label, sized(c, fixed), c.right))}
    </View>
  );
}

function TableHeader({ cols }: { cols: Col[] }) {
  return <View style={{ marginTop: space.sm }}><HeaderRow cols={cols} fixed={false} /></View>;
}

interface Reading { title: string; nightOf: string; text: string }
/** Columns that hold free text: shown on one line, tap to read in full (as in the Sheet tab). */
const LONG_TEXT = new Set(['tags', 'notes']);

function NightRow({ e, cols, odd, last, onRead, fixed = false }: {
  e: Entry; cols: Col[]; odd: boolean; last: boolean; onRead: (r: Reading) => void; fixed?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.sm,
      backgroundColor: odd ? colors.bg : colors.card,
      borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder,
      ...(last ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null),
    }}>
      <Text style={[cellText, sized(NIGHT_COL, fixed), { fontWeight: '600' }]}>{shortNight(e.nightOf)}</Text>
      {cols.map((c) => {
        const v = c.cell(e);
        if (LONG_TEXT.has(c.id) && v.text) {
          return (
            <Pressable key={c.id} style={sized(c, fixed)} onPress={() => onRead({ title: c.label, nightOf: e.nightOf, text: v.text })}
              accessibilityRole="button" accessibilityLabel={`Read ${c.label}`}>
              <Text numberOfLines={1} style={[cellText, {
                textDecorationLine: 'underline', textDecorationColor: colors.muted, ...(v.color ? { color: v.color } : null),
              }]}>{v.text}</Text>
            </Pressable>
          );
        }
        return (
          <Text key={c.id} numberOfLines={1} style={[cellText, sized(c, fixed), {
            textAlign: c.right ? 'right' : 'left', fontVariant: ['tabular-nums'],
            ...(v.color ? { color: v.color } : null), ...(v.bold ? { fontWeight: '700' as const } : null),
          }]}>{v.text}</Text>
        );
      })}
    </View>
  );
}

/** Phones: the table at readable column widths, scrolling sideways, with arrows to the hidden columns. */
function SwipeTable({ entries, cols, onRead }: { entries: Entry[]; cols: Col[]; onRead: (r: Reading) => void }) {
  // A phone draws every row of this table at once, so it shows them a batch at a time: a year or
  // more of nights would otherwise make the tab slow to open.
  const [limit, setLimit] = useState(ROW_BATCH);
  const rows = entries.slice(0, limit);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [x, setX] = useState(0);
  const [viewW, setViewW] = useState(0);
  const contentW = space.md * 2 + NIGHT_COL.width + cols.reduce((sum, c) => sum + c.width + space.md, 0) + 2;
  const more = { left: x > 8, right: viewW > 0 && x < contentW - viewW - 8 };
  const jump = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(contentW - viewW, x + dir * Math.max(120, viewW - 120)));
    scroller.current?.scrollTo({ x: next, animated: true });
    setX(next); // don't wait for the scroll event (browsers may skip it while animating)
  };
  return (
    <View style={{ marginTop: space.sm }} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
      <ScrollView ref={scroller} horizontal persistentScrollbar scrollEventThrottle={32}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}>
        <View style={{ width: contentW }}>
          <HeaderRow cols={cols} fixed />
          {rows.map((e, i) => <NightRow key={e.nightOf} e={e} cols={cols} fixed odd={i % 2 === 1} last={i === rows.length - 1} onRead={onRead} />)}
        </View>
      </ScrollView>
      {more.left && <Arrow side="left" onPress={() => jump(-1)} />}
      {more.right && <Arrow side="right" onPress={() => jump(1)} />}
      {entries.length > limit && (
        <View style={{ marginTop: space.md }}>
          <Button title={`Show ${Math.min(ROW_BATCH, entries.length - limit)} more (${entries.length - limit} left)`} small
            color={colors.chip} textColor={colors.text} onPress={() => setLimit(limit + ROW_BATCH)} />
        </View>
      )}
    </View>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button"
      accessibilityLabel={side === 'right' ? 'Show more columns to the right' : 'Show columns to the left'}
      style={{
        position: 'absolute', top: 2, [side]: 4, width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night, opacity: 0.95,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)', elevation: 6,
      }}>
      <Text style={{ color: colors.bg, fontSize: 20, fontWeight: '800', marginTop: -2 }}>{side === 'right' ? '›' : '‹'}</Text>
    </Pressable>
  );
}
