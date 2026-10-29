// "Export…" panel: pick which columns to include, then export as .xlsx or CSV.
// The Sheet tab uses the same panel (mode "view") for its own, separately saved column choices;
// there it has no export buttons and doesn't touch exports or the Google Sheet.
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
  { group: 'other', title: 'General', get color() { return colors.success; } },
  { group: 'bedtime', title: 'Bedtime', get color() { return colors.night; } },
  { group: 'morning', title: 'Morning', get color() { return colors.morning; } },
];

type Format = 'xlsx' | 'csv';

export function ExportSheet({ visible, onClose, onError, mode = 'export' }: {
  visible: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  /** 'export': Settings → Export. 'view': the Sheet tab's own columns. */
  mode?: 'export' | 'view';
}) {
  const scope = mode === 'view' ? 'sheet' : 'export';
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
    Promise.all([exportableColumns(), loadExcluded(scope), loadFillGaps(scope), loadRoutineDetail(scope)])
      .then(([cols, ex, gaps, detail]) => {
        setColumns(cols);
        setExcluded(ex);
        setFillGaps(gaps);
        setRoutineDetail(detail);
      })
      .catch((e) => onError((e as Error).message));
  }, [visible, onError, scope]);

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

  /** Remember the choices. The export ones also decide which columns a connected Google Sheet shows. */
  const saveChoices = async () => {
    await Promise.all([saveExcluded(excluded, scope), saveFillGaps(fillGaps, scope), saveRoutineDetail(routineDetail, scope)]);
    if (mode === 'export') requestSync(0);
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
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{mode === 'view' ? 'Column settings' : 'Export'}</Text>
        {!columns ? (
          <ActivityIndicator color={colors.night} />
        ) : (
          // The list scrolls inside its own darker, bordered box, so it's clear where it starts and ends
          // (and that there is more below). It never shrinks under about four rows.
          <ScrollView persistentScrollbar
            style={{
              flexGrow: 0, flexShrink: 1, minHeight: 170, backgroundColor: colors.bg,
              borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder,
            }}
            contentContainerStyle={{ gap: space.md, padding: space.md, paddingRight: space.lg }}>
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
                          {locked ? <Text style={{ color: colors.muted }}>  ({mode === 'view' ? 'always shown' : 'always included'})</Text> : null}
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
        {mode === 'view' ? (
          <>
            <Muted>
              These choices are only for the Sheet tab. Exports and your Google Sheet have their own, under
              Settings → Export.
            </Muted>
            <Button title="Done" onPress={() => start(null)} disabled={!columns} />
          </>
        ) : (
          <>
            <Muted>
              {partial ? "Some fields are off, so this CSV won't be a full backup. " : ''}
              .xlsx is a color-coded spreadsheet to read in Excel or Google Sheets. .csv is plain text for
              backups: it keeps one column per routine item, so it can be imported again.
            </Muted>
            <Button title="Export as .xlsx (recommended)" onPress={() => start('xlsx')} disabled={!columns} />
            <Button title="Export as .csv" onPress={() => start('csv')} disabled={!columns}
              color={colors.chip} textColor={colors.text} />
            <Button title="Done" onPress={() => start(null)} color={colors.chip} textColor={colors.text} />
          </>
        )}
    </Panel>
  );
}
