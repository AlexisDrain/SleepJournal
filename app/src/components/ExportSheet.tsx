// "Export…" panel: pick which columns to include, then export as .xlsx or CSV.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { exportableColumns, exportCsv, exportXlsx, REQUIRED_COLUMN } from '@/db/csv';
import type { ColumnGroup, SheetColumn } from '@/db/xlsx';
import { requestSync } from '@/db/sync';
import { loadExcluded, loadFillGaps, loadRoutineDetail, saveExcluded, saveFillGaps, saveRoutineDetail } from '@/lib/exportPrefs';
import { colors, space } from '@/lib/theme';
import { Panel } from './Panel';
import { Button, Muted } from './ui';

const GROUPS: { group: ColumnGroup; title: string; color: string }[] = [
  { group: 'other', title: 'General', color: colors.success },
  { group: 'bedtime', title: 'Bedtime', color: colors.night },
  { group: 'morning', title: 'Morning', color: colors.morning },
];

type Format = 'xlsx' | 'csv';

export function ExportSheet({ visible, onClose, onError }: {
  visible: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [columns, setColumns] = useState<(SheetColumn & { detail: boolean })[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [fillGaps, setFillGaps] = useState(false);
  // Off: each routine is one compact "●●○● 3/4" column. On: also one column per routine item.
  const [routineDetail, setRoutineDetail] = useState(false);
  // iOS can't open the share sheet while this panel is still on screen, so the export
  // waits until the panel has finished closing.
  const pending = useRef<Format | null>(null);

  useEffect(() => {
    if (!visible) return;
    setColumns(null);
    Promise.all([exportableColumns(), loadExcluded(), loadFillGaps(), loadRoutineDetail()])
      .then(([cols, ex, gaps, detail]) => {
        setColumns(cols);
        setExcluded(ex);
        setFillGaps(gaps);
        setRoutineDetail(detail);
      })
      .catch((e) => onError((e as Error).message));
  }, [visible, onError]);

  const setMany = (headers: string[], include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const h of headers) {
        if (h === REQUIRED_COLUMN) continue;
        if (include) next.delete(h);
        else next.add(h);
      }
      return next;
    });

  const runPending = async () => {
    const format = pending.current;
    pending.current = null;
    if (!format) return;
    try {
      const options = { exclude: excluded, fillGaps, routineDetail };
      await (format === 'xlsx' ? exportXlsx(options) : exportCsv(options));
    } catch (e) {
      onError((e as Error).message);
    }
  };

  /** Remember the choices; the Google Sheet (if connected) shows and hides the same columns. */
  const saveChoices = async () => {
    await Promise.all([saveExcluded(excluded), saveFillGaps(fillGaps), saveRoutineDetail(routineDetail)]);
    requestSync(0);
  };

  const start = async (format: Format | null) => {
    await saveChoices();
    pending.current = format;
    onClose();
    if (Platform.OS !== 'ios') runPending(); // Android has no onDismiss; nothing to wait for
  };

  const partial = columns?.some((c) => excluded.has(c.header) && c.header !== REQUIRED_COLUMN);

  return (
    <Panel visible={visible} onClose={onClose} onDismiss={runPending}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Export</Text>
        {!columns ? (
          <ActivityIndicator color={colors.night} />
        ) : (
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: space.md }}>
            {GROUPS.map(({ group, title, color }) => {
              const cols = columns.filter((c) => c.group === group && (routineDetail || !c.detail));
              if (!cols.length) return null;
              return (
                <View key={group} style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                    <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{title}</Text>
                    <Pressable hitSlop={8} onPress={() => setMany(cols.map((c) => c.header), true)}>
                      <Text style={{ color }}>All</Text>
                    </Pressable>
                    <Text style={{ color: colors.muted }}> · </Text>
                    <Pressable hitSlop={8} onPress={() => setMany(cols.map((c) => c.header), false)}>
                      <Text style={{ color }}>None</Text>
                    </Pressable>
                  </View>
                  {cols.map((c) => {
                    const locked = c.header === REQUIRED_COLUMN;
                    const on = locked || !excluded.has(c.header);
                    return (
                      <Pressable key={c.header} disabled={locked} onPress={() => setMany([c.header], !on)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: color,
                          backgroundColor: on ? color : 'transparent', opacity: locked ? 0.5 : 1,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {on && <Text style={{ color: colors.bg, fontWeight: '800', fontSize: 12 }}>✓</Text>}
                        </View>
                        <Text style={{ color: colors.text, fontSize: 15, flexShrink: 1 }}>
                          {c.header.replace(/^(Bedtime|Morning): /, '')}
                          {locked ? <Text style={{ color: colors.muted }}>  (always included)</Text> : null}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>One column per routine item</Text>
            <Muted>{routineDetail ? 'Each item gets its own column, next to the summary.' : 'Each routine is one compact column, like ●●○● 3/4.'}</Muted>
          </View>
          <Switch value={routineDetail} onValueChange={setRoutineDetail} trackColor={{ true: colors.night }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>Include nights you didn't fill in</Text>
            <Muted>{fillGaps ? 'Every night gets a row; missing ones stay blank.' : 'Only nights with an entry get a row.'}</Muted>
          </View>
          <Switch value={fillGaps} onValueChange={setFillGaps} trackColor={{ true: colors.night }} />
        </View>
        <Muted>
          {partial ? "Some fields are off, so this CSV won't be a full backup. " : ''}
          CSV always keeps one column per routine item, so a backup can be restored. A connected Google Sheet
          shows the same fields as here; the rest are hidden there, not deleted.
        </Muted>
        <Button title="Spreadsheet (.xlsx)" onPress={() => start('xlsx')} disabled={!columns} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Button title="CSV" small onPress={() => start('csv')} disabled={!columns}
              color={colors.chip} textColor={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Done" small onPress={() => start(null)} color={colors.chip} textColor={colors.text} />
          </View>
        </View>
    </Panel>
  );
}
