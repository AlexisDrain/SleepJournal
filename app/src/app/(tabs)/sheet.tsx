// Sheet: the journal as a spreadsheet, inside the app. It's drawn from the same table the export
// builds (so it matches what you'd see in Google Sheets or Excel), straight from the database on
// this device: no internet or Google needed. Newest night on top; tap a row to open that night.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { ExportSheet } from '@/components/ExportSheet';
import { Button, ErrorBox, Muted, styles } from '@/components/ui';
import { buildTable } from '@/db/csv';
import type { ColumnGroup, SheetColumn, SheetValue } from '@/db/xlsx';
import { loadExcluded, loadRoutineDetail } from '@/lib/exportPrefs';
import { colors, space } from '@/lib/theme';

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 44;
// Dark-theme versions of the export's green / blue / yellow: [header, cell]
const TINT: Record<ColumnGroup, [string, string]> = {
  other: ['#1f3d30', '#14211b'],
  bedtime: ['#2a3170', '#171b38'],
  morning: ['#57431d', '#231d12'],
};
const widthOf = (c: SheetColumn) => Math.max(72, Math.round(c.width * 8.5));

/** "9-26-2026" → "2026-09-26" */
function toNightOf(v: SheetValue): string | null {
  const m = String(v ?? '').match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

export default function SheetScreen() {
  const [columns, setColumns] = useState<SheetColumn[]>([]);
  const [rows, setRows] = useState<SheetValue[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The same field choices as exports, so this is a preview of what an export would contain.
      const t = await buildTable({ exclude: await loadExcluded(), routineDetail: await loadRoutineDetail(), plainHeaders: true });
      setColumns(t.columns);
      setRows(t.rows.reverse());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const totalWidth = columns.reduce((sum, c) => sum + widthOf(c), 0);

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <View style={{ flex: 1 }}>
          <Muted>{loading ? 'Loading…' : `${rows.length} night${rows.length === 1 ? '' : 's'} · newest first · tap a row to open it`}</Muted>
        </View>
        <Button title="Fields & export…" small onPress={() => setChoosing(true)} color={colors.chip} textColor={colors.text} />
      </View>
      {error && <View style={{ paddingHorizontal: space.lg }}><ErrorBox message={error} onRetry={load} /></View>}

      {loading ? (
        <ActivityIndicator color={colors.night} />
      ) : rows.length === 0 ? (
        <View style={{ padding: space.lg }}><Muted>Nothing here yet. Nights you fill in on the Journal tab show up as rows.</Muted></View>
      ) : (
        // Sideways scrolling moves the header and rows together; the rows scroll up and down under the header.
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ width: totalWidth }}>
          <View style={{ width: totalWidth, flex: 1 }}>
            <View style={{ flexDirection: 'row', height: HEADER_HEIGHT }}>
              {columns.map((c) => (
                <View key={c.header} style={{
                  width: widthOf(c), backgroundColor: TINT[c.group][0], justifyContent: 'center', paddingHorizontal: 8,
                  borderRightWidth: 1, borderRightColor: colors.bg,
                }}>
                  <Text numberOfLines={2} style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{c.header}</Text>
                </View>
              ))}
            </View>
            <FlatList
              data={rows}
              keyExtractor={(r, i) => String(r[0] ?? i)}
              getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
              initialNumToRender={30}
              windowSize={7}
              renderItem={({ item }) => {
                const night = toNightOf(item[0]);
                return (
                  <Pressable disabled={!night} onPress={() => night && router.navigate({ pathname: '/', params: { night } })}
                    style={{ flexDirection: 'row', height: ROW_HEIGHT }}>
                    {columns.map((c, i) => (
                      <View key={c.header} style={{
                        width: widthOf(c), backgroundColor: TINT[c.group][1], justifyContent: 'center', paddingHorizontal: 8,
                        borderRightWidth: 1, borderRightColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.bg,
                      }}>
                        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13 }}>{item[i] ?? ''}</Text>
                      </View>
                    ))}
                  </Pressable>
                );
              }}
            />
          </View>
        </ScrollView>
      )}

      <ExportSheet visible={choosing} onError={setError}
        onClose={() => {
          setChoosing(false);
          setTimeout(load, 300); // the field choices may have changed
        }} />
    </View>
  );
}
