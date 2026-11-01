// Routines: tick off a night's bedtime / morning routine like a to-do list, or switch to Edit
// to change the items themselves (rename, add, hide) and manage tags. It opens on the current
// night; the arrows and the calendar reach other nights.
//
// The third list, Anytime, covers a calendar day (midnight to midnight) instead of a night, so it
// shows its own date and its ticks are saved with that date (see anytimeDay).
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarSheet } from '@/components/CalendarSheet';
import { NightSwitcher, Routine } from '@/components/inputs';
import { KIND_LABEL, RoutineItemEditor } from '@/components/RoutineItemEditor';
import { TagManager } from '@/components/TagManager';
import { SwapSlide } from '@/components/SwapSlide';
import { SyncChip } from '@/components/SyncChip';
import { joinStatus, useSyncText } from '@/components/SyncLine';
import { SortableList } from '@/components/SortableList';
import { Button, Card, Chip, ErrorBox, Input, Muted, Row, styles } from '@/components/ui';
import { store } from '@/db/store';
import { onPulled, requestSync } from '@/db/sync';
import { forgetEdits, rememberEdits } from '@/lib/pendingEdits';
import { usePullToSync } from '@/lib/usePullToSync';
import { anytimeDay, dueSlot, untilHint } from '@/lib/journal';
import { useHour24 } from '@/lib/clockFormat';
import { useThemeName } from '@/lib/displayMode';
import { usePhaseOrder } from '@/lib/phaseOrder';
import { colors, space } from '@/lib/theme';
import { dayLabel } from '@/lib/time';
import { NARROW_PAGE, page, useWide, WIDE_PAGE } from '@/lib/useLayout';
import type { RoutineItem, RoutinePhase, RoutineValue } from '@/lib/types';

// Bedtime and Morning look like the Journal's sections; Anytime is a third list tied to neither.
const PHASE_NAME: Record<RoutinePhase, string> = { bedtime: 'Bedtime', morning: 'Morning', anytime: 'Anytime' };
const PHASE_COLOR: Record<RoutinePhase, string> = { get bedtime() { return colors.night; }, get morning() { return colors.morning; }, get anytime() { return colors.success; } };
const PHASE_ICON: Record<RoutinePhase, string> = { bedtime: '☾', morning: '☀', anytime: '✓' };
const EXAMPLE: Record<RoutinePhase, string> = { bedtime: 'Turned off computer', morning: 'Stretch', anytime: 'Exercise' };
const SAVE_DELAY_MS = 500;
const RETURN_TO_NOW_AFTER_MS = 10 * 60_000; // the same wait as the Journal

export default function RoutinesScreen() {
  const pullControl = usePullToSync();
  useThemeName(); // redraw when the display changes (dark / light)
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // false until the lists have been read once: show a spinner, not empty lists
  const [routine, setRoutine] = useState<RoutineItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<RoutineItem | null>(null);
  // Which night the ticks belong to. Opening the tab starts on the night that's current right
  // now (last night until 3 PM, tonight after).
  const [nightOf, setNightOf] = useState(() => dueSlot().nightOf);
  const shown = useRef(nightOf); // the latest choice, for loads that finish out of order
  const [values, setValues] = useState<Record<string, RoutineValue>>({});
  // The Anytime list's own day, and that day's ticks.
  const [anyDay, setAnyDay] = useState(() => anytimeDay(nightOf));
  const [anyValues, setAnyValues] = useState<Record<string, RoutineValue>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const wide = useWide();
  const syncText = useSyncText(); // "Last synced …", when a Google Sheet is connected
  useHour24(); // redraw the times if the 12/24-hour setting changes
  const [phases, swapPhases, sliding] = usePhaseOrder('routines'); // Bedtime first, or Morning first if you swapped them
  const lists: RoutinePhase[] = [...phases, 'anytime'];

  const load = useCallback(async (night: string = shown.current) => {
    setError(null);
    shown.current = night;
    setNightOf(night);
    const day = anytimeDay(night);
    setAnyDay(day);
    try {
      const [r, entry, dayEntry] = await Promise.all([store.routine.list(), store.getEntry(night), store.getEntry(day)]);
      if (shown.current !== night) return; // another night was picked meanwhile
      setRoutine(r);
      setValues(entry?.routine ?? {});
      setAnyValues(dayEntry?.routine ?? {});
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Ticks show at once and are written shortly after, so typing a number or note isn't one save per key.
  // Waiting ticks are kept per date, because the Anytime list saves to a different date than the other two.
  const pending = useRef<Record<string, Record<string, RoutineValue>> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    try {
      for (const [date, ticks] of Object.entries(p)) {
        await store.saveEntry(date, { routine: ticks });
        forgetEdits('routines', date);
      }
      requestSync(); // to the Google Sheet, if connected
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const tick = (list: RoutinePhase) => (id: number, v: RoutineValue) => {
    const date = list === 'anytime' ? anyDay : nightOf;
    (list === 'anytime' ? setAnyValues : setValues)((prev) => ({ ...prev, [id]: v }));
    pending.current = { ...pending.current, [date]: { ...pending.current?.[date], [id]: v } };
    rememberEdits('routines', date, { routine: pending.current[date] });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  useEffect(() => void load(), [load]); // a phone can swipe to this page before it's focused
  useFocusEffect(useCallback(() => {
    load(dueSlot().nightOf);
    return () => void flush(); // leaving the tab: write anything still waiting
  }, [load, flush]));

  // The app was in the background and is opened again with this tab showing: save what was
  // waiting when it went away, and after a while away go back to the current night (it may have
  // changed at 3 PM, and Anytime's day at midnight). A short absence keeps the night you were on.
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        awaySince.current ??= Date.now();
        // Leaving the app or tab: save now and send it, instead of waiting for the usual delays.
        const unsaved = pending.current !== null;
        void flush().then(() => { if (unsaved) requestSync(0); });
        return;
      }
      const away = awaySince.current ? Date.now() - awaySince.current : 0;
      awaySince.current = null;
      void load(away > RETURN_TO_NOW_AFTER_MS ? dueSlot().nightOf : undefined);
    });
    return () => sub.remove();
  }, [load, flush]);

  /** Show another night. Coming days are allowed too, so things can be ticked or planned ahead. */
  const goTo = async (night: string) => {
    await flush(); // ticks still waiting belong to the night being left
    await load(night);
  };

  // A sync brought a changed list (edited on another device) or ticks: show them.
  useEffect(() => onPulled(() => {
    if (!pending.current) void load();
  }), [load]);

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      requestSync(); // the routine list syncs through the Google Sheet, if connected
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const hide = (r: RoutineItem) => act(() => store.routine.update(r.id, { archived: true }));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, page(wide ? WIDE_PAGE : NARROW_PAGE)]} keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets refreshControl={pullControl}>
        {error && <ErrorBox message={error} onRetry={() => load()} />}
        {!editMode && (
          <NightSwitcher nightOf={nightOf} onChange={goTo} onOpenCalendar={() => setCalendarOpen(true)}
            onToday={nightOf === dueSlot().nightOf ? null : () => void goTo(dueSlot().nightOf)} />
        )}
        {editMode && <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: space.md }}>Edit routines</Text>}
        {/* One short line and then the buttons, spaced exactly like the Journal's "Changes save
            automatically" line, so the buttons sit at the same height on both tabs. */}
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: editMode ? 0 : -space.sm, marginBottom: space.md, fontSize: 13 }}>
          {editMode ? 'Edit or hide each item. Drag ≡ to change the order.' : joinStatus('Ticks save automatically', syncText)}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.md, marginBottom: space.md }}>
          {/* Swaps Bedtime and Morning on this screen only. The data doesn't change. */}
          <Chip label={wide ? '⇄ Swap' : '⇅ Swap'} onPress={swapPhases} />
          {!editMode && <SyncChip />}
          <Chip label={editMode ? 'Done' : 'Edit'} selected={editMode} onPress={() => setEditMode((v) => !v)} />
        </View>

        {!loaded && !error && <ActivityIndicator color={colors.night} style={{ marginBottom: space.md }} />}
        <View style={[wide ? { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' } : undefined, !loaded && { opacity: 0 }]}>
          {lists.map((phase) => {
            const items = routine.filter((r) => r.phase === phase && !r.archived);
            return (
              <SwapSlide key={phase} sliding={sliding} style={wide ? { flex: 1 } : undefined}>
                {/* The colored left edge matches the Journal's Bedtime / Morning sections. */}
                <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: PHASE_COLOR[phase] }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Text style={{ color: PHASE_COLOR[phase], fontSize: 22 }}>{PHASE_ICON[phase]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{PHASE_NAME[phase]}</Text>
                      {/* The hours this list covers: a check-in's window, or for Anytime its whole calendar day. */}
                      {!editMode && <Muted>{phase === 'anytime' ? `${dayLabel(anyDay)} · all day` : untilHint(phase, nightOf)}</Muted>}
                    </View>
                  </View>
                  {editMode ? (
                    <>
                      {/* Drag the ≡ handle to reorder. Hide keeps the item's past ticks, and it can come back from Hidden items. */}
                      <SortableList items={items} keyOf={(r) => String(r.id)}
                        onReorder={(next) => act(() => store.routine.setOrder(phase, next.map((r) => r.id)))()}
                        renderItem={(r) => (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                            <Pressable onPress={() => setEditing(r)} style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text, fontSize: 16 }}>{r.label}</Text>
                              {r.kind !== 'check' && <Muted>+ {KIND_LABEL[r.kind]}</Muted>}
                            </Pressable>
                            <Button title="Edit" small color={colors.chip} textColor={colors.text} onPress={() => setEditing(r)} />
                            <Button title="Hide" small color={colors.chip} textColor={colors.danger} onPress={hide(r)} />
                          </View>
                        )} />
                      <NewRoutineItem phase={phase} onCreate={(item) => act(() => store.routine.create(item))()} />
                    </>
                  ) : items.length ? (
                    <Routine items={items} values={phase === 'anytime' ? anyValues : values} onChange={tick(phase)}
                      nightOf={phase === 'anytime' ? anyDay : nightOf} phase={phase}
                      accent={PHASE_COLOR[phase]} onEdit={setEditing} onHide={(r) => hide(r)()} />
                  ) : (
                    <Muted>Nothing here yet. Tap Edit to add items.</Muted>
                  )}
                </View>
              </SwapSlide>
            );
          })}
        </View>

        {editMode && (
          <>
            <HiddenItems items={routine.filter((r) => r.archived)}
              onRestore={(r) => act(() => store.routine.update(r.id, { archived: false }))()}
              onDelete={(r) => act(() => store.routine.remove(r.id))()} />
            <Card title="Tags">
              <TagManager />
            </Card>
          </>
        )}
      </ScrollView>
      <RoutineItemEditor item={editing} onClose={() => setEditing(null)} onSaved={() => load()} />
      <CalendarSheet visible={calendarOpen} selected={nightOf} allowFuture onClose={() => setCalendarOpen(false)}
        onPick={(n) => {
          setCalendarOpen(false);
          goTo(n);
        }} />
    </View>
  );
}

/** Type a label; optionally pick what else it records. Most items are plain checkboxes. */
function NewRoutineItem({ phase, onCreate }: { phase: RoutinePhase; onCreate: (i: Pick<RoutineItem, 'label' | 'phase' | 'kind'>) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<RoutineItem['kind']>('check');
  const submit = () => {
    if (!label.trim()) return;
    onCreate({ label: label.trim(), phase, kind });
    setLabel('');
    setKind('check');
  };
  return (
    <View style={{ gap: space.sm }}>
      <Input placeholder={`+ e.g. ${EXAMPLE[phase]}`}
        value={label} onChangeText={setLabel} onSubmitEditing={submit} returnKeyType="done" />
      {label.trim() !== '' && (
        <>
          <Muted>Also record:</Muted>
          <View style={styles.chips}>
            {(Object.keys(KIND_LABEL) as RoutineItem['kind'][]).map((k) => (
              <Chip key={k} label={KIND_LABEL[k]} selected={kind === k}
                onPress={() => setKind(k)} color={PHASE_COLOR[phase]} />
            ))}
          </View>
          <Button title="Add" small onPress={submit} color={PHASE_COLOR[phase]} />
        </>
      )}
    </View>
  );
}

function HiddenItems({ items, onRestore, onDelete }: { items: RoutineItem[]; onRestore: (r: RoutineItem) => void; onDelete: (r: RoutineItem) => void }) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<number | null>(null); // Delete can't be undone: it takes a second tap
  if (!items.length) return null;
  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)}>
        <Muted>{open ? '▴' : '▾'} {items.length} hidden routine item{items.length > 1 ? 's' : ''} (history kept)</Muted>
      </Pressable>
      {open && items.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
          <Text style={{ color: colors.text, fontSize: 16, flex: 1, minWidth: 0 }}>{r.label} · {PHASE_NAME[r.phase].toLowerCase()}</Text>
          <Button title="Restore" small color={colors.chip} textColor={colors.text} onPress={() => onRestore(r)} />
          <Button title={asked === r.id ? 'Delete with its ticks?' : 'Delete'} small color={colors.chip} textColor={colors.danger}
            onPress={() => (asked === r.id ? onDelete(r) : setAsked(r.id))} />
        </View>
      ))}
    </Card>
  );
}
