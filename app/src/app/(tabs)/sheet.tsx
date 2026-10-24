// Sheet: the journal as a spreadsheet, inside the app. It's drawn from the same table the export
// builds (so it matches what you'd see in Google Sheets or Excel), straight from the database on
// this device: no internet or Google needed. It is for reading: rows can't be tapped. Like the Google Sheet, it has one page per year with
// the oldest night on top; it opens scrolled to the bottom, where the newest night is.
//
// The date column stays put while the rest scrolls sideways, and edge arrows show (and jump to)
// the columns that are off screen, so it's clear on a phone that there is more to the right.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ExportSheet } from '@/components/ExportSheet';
import { Button, Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { buildTable } from '@/db/csv';
import type { ColumnGroup, SheetColumn, SheetValue } from '@/db/xlsx';
import { arrangeColumns, loadColumnOrder, loadExcluded, loadFillGaps, loadRoutineDetail, saveColumnOrder, TEXT_COLUMNS } from '@/lib/exportPrefs';
import { Panel } from '@/components/Panel';
import { SortableList } from '@/components/SortableList';
import { colors, space, tints } from '@/lib/theme';
import { useThemeName } from '@/lib/displayMode';

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 44;
// Dark-theme versions of the export's green / blue / yellow: [header, cell]
const TINT: Record<ColumnGroup, [string, string]> = {
  get other() { return tints.other; },
  get bedtime() { return tints.bedtime; },
  get morning() { return tints.morning; },
};
const widthOf = (c: SheetColumn) => Math.max(72, Math.round(c.width * 8.5));

const yearOf = (row: SheetValue[]) => String(row[0] ?? '').slice(-4);

export default function SheetScreen() {
  const theme = useThemeName(); // redraw when the display changes
  const [columns, setColumns] = useState<SheetColumn[]>([]);
  const [allRows, setAllRows] = useState<SheetValue[][]>([]);
  const [chosenYear, setChosenYear] = useState<string | null>(null); // null = the latest year
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [reading, setReading] = useState<{ title: string; night: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The Sheet tab's own column choices (the "Column settings" button), saved separately from the export ones.
      const [exclude, routineDetail, fillGaps] = await Promise.all([loadExcluded('sheet'), loadRoutineDetail('sheet'), loadFillGaps('sheet')]);
      const t = await buildTable({ exclude, routineDetail, fillGaps, plainHeaders: true });
      // The Sheet tab's own column order (only how it's shown; the data and exports don't change).
      const order = arrangeColumns(t.columns.map((c) => c.header), await loadColumnOrder());
      const at = order.map((h) => t.columns.findIndex((c) => c.header === h));
      setColumns(at.map((i) => t.columns[i]));
      setAllRows(t.rows.map((r) => at.map((i) => r[i]))); // oldest first, as in the Google Sheet
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Open at the bottom: the newest night is the last row. Once per opening (or per year picked),
  // as soon as the list reports its size. Browsers don't always report it, so there the jump is
  // also made a moment after the rows are drawn (see the effect below).
  const list = useRef<FlatList<SheetValue[]>>(null);
  const jumpWanted = useRef(true);
  const [opened, setOpened] = useState(0);
  const jumpToEnd = useCallback((size: number) => {
    if (!jumpWanted.current || size <= 0) return;
    jumpWanted.current = false;
    list.current?.scrollToEnd({ animated: false });
  }, []);

  useFocusEffect(useCallback(() => {
    jumpWanted.current = true;
    load().then(() => setOpened((n) => n + 1));
  }, [load]));

  // One page per year, like the Google Sheet's tabs. Opens on the latest year.
  const years = useMemo(() => [...new Set(allRows.map(yearOf))].sort(), [allRows]);
  const year = chosenYear && years.includes(chosenYear) ? chosenYear : years.at(-1) ?? '';
  const rows = useMemo(() => allRows.filter((r) => yearOf(r) === year), [allRows, year]);

  useEffect(() => {
    if (!rows.length) return;
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, [opened, year, rows.length]);

  // ---------- sideways scrolling ----------
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollX = useRef(new Animated.Value(0)).current; // drives the pinned date column
  const offset = useRef(0);
  // How wide the table's window is. Measured when the platform reports it (layout or scroll
  // events); until then the screen width is a close enough guess to decide whether to show arrows.
  const windowWidth = useWindowDimensions().width;
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const viewWidth = measuredWidth || windowWidth;
  const [more, setMore] = useState({ left: false, right: true });

  const totalWidth = columns.reduce((sum, c) => sum + widthOf(c), 0);
  const pinnedWidth = columns.length ? widthOf(columns[0]) : 0;
  const scrollable = viewWidth > 0 && totalWidth > viewWidth + 1;

  const updateArrows = useCallback((x: number, width = viewWidth) => {
    offset.current = x;
    const next = { left: x > 8, right: width > 0 && x < totalWidth - width - 8 };
    setMore((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, [totalWidth, viewWidth]);

  // One scroll handler for the life of the screen (it reads the latest state through a ref).
  // It moves the pinned column and keeps the arrows right.
  //   Phones: the pinned column is driven natively, so it can't lag behind your finger.
  //   Web: there is no native driver, so the position is simply set on each scroll event.
  const latest = useRef({ updateArrows, measuredWidth, viewWidth });
  latest.current = { updateArrows, measuredWidth, viewWidth };
  const onScroll = useMemo(() => {
    type ScrollEvent = { nativeEvent: { contentOffset: { x: number }; layoutMeasurement?: { width: number } } };
    const track = (e: ScrollEvent) => {
      const now = latest.current;
      const w = e.nativeEvent.layoutMeasurement?.width;
      if (w && w !== now.measuredWidth) setMeasuredWidth(w);
      now.updateArrows(e.nativeEvent.contentOffset.x, w || now.viewWidth);
    };
    if (Platform.OS === 'web') {
      return (e: ScrollEvent) => {
        scrollX.setValue(e.nativeEvent.contentOffset.x);
        track(e);
      };
    }
    return Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: track });
  }, [scrollX]);

  /** Jump most of a screen left or right (a little overlap keeps your place). */
  const jump = (direction: 1 | -1) => {
    const step = Math.max(120, viewWidth - pinnedWidth - 40);
    const x = Math.max(0, Math.min(totalWidth - viewWidth, offset.current + direction * step));
    // Smooth on phones; instant on the web, where a browser can skip the animation (e.g. in a background tab).
    scroller.current?.scrollTo({ x, animated: Platform.OS !== 'web' });
    // Record where we are now instead of waiting for a scroll event to say so, so the next tap
    // continues from here and the arrows update at once.
    updateArrows(x);
    if (Platform.OS === 'web') scrollX.setValue(x);
  };

  /** The first cell of a row or the header: it slides right exactly as far as the table slides left. */
  const pinned = (content: string, background: string, height: number, bold: boolean) => (
    <Animated.View
      style={{
        position: 'absolute', left: 0, top: 0, width: pinnedWidth, height, backgroundColor: background,
        justifyContent: 'center', paddingHorizontal: 8, transform: [{ translateX: scrollX }],
        borderRightWidth: 2, borderRightColor: colors.cardBorder, borderBottomWidth: bold ? 0 : 1, borderBottomColor: colors.bg,
      }}>
      <Text numberOfLines={bold ? 2 : 1} style={{ color: colors.text, fontSize: bold ? 12 : 13, fontWeight: bold ? '700' : '600' }}>
        {content}
      </Text>
    </Animated.View>
  );

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <View style={{ flex: 1 }}>
          <Muted>
            {loading
              ? 'Loading…'
              : `${rows.length} night${rows.length === 1 ? '' : 's'}${years.length > 1 ? ` in ${year}` : ''}${scrollable ? ' · swipe sideways for more columns →' : ''}`}
          </Muted>
        </View>
        <Button title="Column settings" small onPress={() => setChoosing(true)} color={colors.chip} textColor={colors.text} />
        <Button title="Column order" small onPress={() => setOrdering(true)} color={colors.chip} textColor={colors.text} />
      </View>
      {error && <View style={{ paddingHorizontal: space.lg }}><ErrorBox message={error} onRetry={load} /></View>}
      {years.length > 1 && (
        <View style={{ flexGrow: 0 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md }}>
            {years.map((y) => <Chip key={y} label={y} selected={y === year} onPress={() => {
              if (y === year) return;
              jumpWanted.current = true; // the list is rebuilt for the new year
              setChosenYear(y);
            }} />)}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.night} />
      ) : rows.length === 0 ? (
        <View style={{ padding: space.lg }}><Muted>Nothing here yet. Nights you fill in on the Journal tab show up as rows.</Muted></View>
      ) : (
        <View style={{ flex: 1 }} onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setMeasuredWidth(w);
          updateArrows(offset.current, w);
        }}>
          {/* Sideways scrolling moves the header and rows together; the rows scroll up and down under the header. */}
          <Animated.ScrollView
            ref={scroller}
            horizontal
            persistentScrollbar
            style={{ flex: 1 }}
            contentContainerStyle={{ width: totalWidth }}
            scrollEventThrottle={16}
            onScroll={onScroll}>
            <View style={{ width: totalWidth, flex: 1 }}>
              <View style={{ flexDirection: 'row', height: HEADER_HEIGHT, zIndex: 2 }}>
                {columns.map((c, i) => (
                  <View key={c.header} style={{
                    width: widthOf(c), backgroundColor: TINT[c.group][0], justifyContent: 'center', paddingHorizontal: 8,
                    borderRightWidth: 1, borderRightColor: colors.bg,
                  }}>
                    {i > 0 && <Text numberOfLines={2} style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{c.header}</Text>}
                  </View>
                ))}
                {pinned(columns[0].header, TINT[columns[0].group][0], HEADER_HEIGHT, true)}
              </View>
              <FlatList
                key={year}
                extraData={theme}
                ref={list}
                onContentSizeChange={(_, h) => jumpToEnd(h)}
                data={rows}
                keyExtractor={(r, i) => String(r[0] ?? i)}
                getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
                initialNumToRender={30}
                windowSize={7}
                renderItem={({ item }) => (
                    <View style={{ flexDirection: 'row', height: ROW_HEIGHT }}>
                      {columns.map((c, i) => (
                        <View key={c.header} style={{
                          width: widthOf(c), backgroundColor: TINT[c.group][1], justifyContent: 'center', paddingHorizontal: 8,
                          borderRightWidth: 1, borderRightColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.bg,
                        }}>
                          {i > 0 && (TEXT_COLUMNS.includes(c.header) && item[i]
                            // Notes, dreams and tags are often longer than the cell: tap to read all of it.
                            ? <Pressable onPress={() => setReading({ title: c.header, night: String(item[0] ?? ''), text: String(item[i]) })}
                                accessibilityRole="button" accessibilityLabel={`Read ${c.header}`}>
                                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, textDecorationLine: 'underline', textDecorationColor: colors.muted }}>{item[i]}</Text>
                              </Pressable>
                            : <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13 }}>{item[i] ?? ''}</Text>)}
                        </View>
                      ))}
                      {pinned(String(item[0] ?? ''), TINT[columns[0].group][1], ROW_HEIGHT, false)}
                    </View>
                )}
              />
            </View>
          </Animated.ScrollView>

          {scrollable && more.right && <EdgeArrow side="right" onPress={() => jump(1)} />}
          {more.left && <EdgeArrow side="left" inset={pinnedWidth} onPress={() => jump(-1)} />}
        </View>
      )}

      <Panel visible={reading !== null} onClose={() => setReading(null)}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{reading?.title}</Text>
        <Muted>Night of {reading?.night}</Muted>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>
          <Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{reading?.text}</Text>
        </ScrollView>
        <Button title="Close" small onPress={() => setReading(null)} color={colors.chip} textColor={colors.text} />
      </Panel>

      <Panel visible={ordering} onClose={() => setOrdering(false)}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Column order</Text>
        <Muted>Drag ≡ to change the order of the columns here. Only this tab changes; your data, exports and Google Sheet stay as they are.</Muted>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>
          <SortableList items={columns.slice(1).map((c) => c.header)} keyOf={(h) => h}
            onReorder={(next) => { saveColumnOrder(next).then(load, () => {}); }}
            renderItem={(h) => <Text style={{ color: colors.text, fontSize: 15, paddingVertical: 8 }}>{h}</Text>} />
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Button title="Reset order" small color={colors.chip} textColor={colors.text}
              onPress={() => { saveColumnOrder(null).then(load, () => {}); }} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Done" small onPress={() => setOrdering(false)} />
          </View>
        </View>
      </Panel>

      <ExportSheet mode="view" visible={choosing} onError={setError}
        onClose={() => {
          setChoosing(false);
          setTimeout(load, 300); // the field choices may have changed
        }} />
    </View>
  );
}

/** A round arrow on the table's edge: shows that more columns are that way, and jumps to them. */
function EdgeArrow({ side, inset = 0, onPress }: { side: 'left' | 'right'; inset?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}
      accessibilityRole="button" accessibilityLabel={side === 'right' ? 'Show more columns to the right' : 'Show columns to the left'}
      style={{
        position: 'absolute', top: HEADER_HEIGHT + 12, [side]: (side === 'left' ? inset : 0) + 8,
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.night, opacity: 0.95,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)', elevation: 6,
      }}>
      <Text style={{ color: colors.bg, fontSize: 22, fontWeight: '800', marginTop: -2 }}>{side === 'right' ? '›' : '‹'}</Text>
    </Pressable>
  );
}
