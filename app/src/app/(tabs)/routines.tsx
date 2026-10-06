// Routines: tick off a night's bedtime / morning routine like a to-do list, or switch to Edit
// to change the items themselves (rename, add, hide) and manage tags. It opens on the current
// night; the arrows and the calendar reach earlier nights.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarSheet } from '@/components/CalendarSheet';
import { NightSwitcher, Routine } from '@/components/inputs';
import { KIND_LABEL, RoutineItemEditor } from '@/components/RoutineItemEditor';
import { SwipeRow } from '@/components/SwipeRow';
import { Button, Card, Chip, ErrorBox, Input, Muted, Row, styles } from '@/components/ui';
import { store } from '@/db/store';
import { requestSync } from '@/db/sync';
import { confirmAction } from '@/lib/confirm';
import { dueSlot } from '@/lib/journal';
import { colors, space } from '@/lib/theme';
import { NARROW_PAGE, page, useWide, WIDE_PAGE } from '@/lib/useLayout';
import type { Phase, RoutineItem, RoutineValue, Tag } from '@/lib/types';

const PHASES: Phase[] = ['bedtime', 'morning'];
const PHASE_NAME: Record<Phase, string> = { bedtime: 'Bedtime', morning: 'Morning' };
const PHASE_COLOR: Record<Phase, string> = { bedtime: colors.night, morning: colors.morning };
const SAVE_DELAY_MS = 500;

export default function RoutinesScreen() {
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [routine, setRoutine] = useState<RoutineItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<RoutineItem | null>(null);
  // Which night the ticks belong to. Opening the tab starts on the night that's current right
  // now (last night until 3 PM, tonight after).
  const [nightOf, setNightOf] = useState(() => dueSlot().nightOf);
  const shown = useRef(nightOf); // the latest choice, for loads that finish out of order
  const [values, setValues] = useState<Record<string, RoutineValue>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const wide = useWide();

  const load = useCallback(async (night: string = shown.current) => {
    setError(null);
    shown.current = night;
    setNightOf(night);
    try {
      const [t, r, entry] = await Promise.all([store.tags.list(), store.routine.list(), store.getEntry(night)]);
      if (shown.current !== night) return; // another night was picked meanwhile
      setTags(t);
      setRoutine(r);
      setValues(entry?.routine ?? {});
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Ticks show at once and are written shortly after, so typing a number or note isn't one save per key.
  const pending = useRef<{ night: string; routine: Record<string, RoutineValue> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    try {
      await store.saveEntry(p.night, { routine: p.routine });
      requestSync(); // to the Google Sheet, if connected
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const tick = (id: number, v: RoutineValue) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    pending.current = { night: nightOf, routine: { ...pending.current?.routine, [id]: v } };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  useFocusEffect(useCallback(() => {
    load(dueSlot().nightOf);
    return () => void flush(); // leaving the tab: write anything still waiting
  }, [load, flush]));

  /** Show another night (never one that hasn't started yet). */
  const goTo = async (night: string) => {
    if (night > dueSlot().nightOf) return;
    await flush(); // ticks still waiting belong to the night being left
    await load(night);
  };

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteTag = async (t: Tag) => {
    if (await confirmAction(`Delete tag “${t.name}”?`, 'It will also be removed from past nights.', 'Delete')) {
      act(() => store.tags.remove(t.id))();
    }
  };

  const hide = (r: RoutineItem) => act(() => store.routine.update(r.id, { archived: true }));

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, page(wide ? WIDE_PAGE : NARROW_PAGE)]} keyboardShouldPersistTaps="handled">
        {error && <ErrorBox message={error} onRetry={() => load()} />}
        {!editMode && (
          <NightSwitcher nightOf={nightOf} onChange={goTo} onOpenCalendar={() => setCalendarOpen(true)}
            onToday={nightOf === dueSlot().nightOf ? null : () => void goTo(dueSlot().nightOf)} />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            {editMode && <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Edit routines</Text>}
            <Muted>
              {editMode
                ? 'Tap an item to rename it, change what it records, or hide it.'
                : 'Tick things off as you do them. They save to this night in your Journal.'}
            </Muted>
          </View>
          <Chip label={editMode ? 'Done' : 'Edit'} selected={editMode} onPress={() => setEditMode((v) => !v)} />
        </View>

        <View style={wide ? { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' } : undefined}>
          {PHASES.map((phase) => {
            const items = routine.filter((r) => r.phase === phase && !r.archived);
            return (
              <View key={phase} style={wide ? { flex: 1 } : undefined}>
                <Card title={`${PHASE_NAME[phase]} routine`}>
                  {editMode ? (
                    <>
                      <View>
                        {items.map((r) => (
                          <SwipeRow key={r.id} onEdit={() => setEditing(r)} onHide={hide(r)}>
                            <Pressable onPress={() => setEditing(r)}>
                              <Row label={r.label}>{r.kind !== 'check' ? <Muted>+ {KIND_LABEL[r.kind]}</Muted> : null}</Row>
                            </Pressable>
                          </SwipeRow>
                        ))}
                      </View>
                      <NewRoutineItem phase={phase} onCreate={(item) => act(() => store.routine.create(item))()} />
                    </>
                  ) : items.length ? (
                    <Routine items={items} values={values} onChange={tick} nightOf={nightOf} phase={phase}
                      accent={PHASE_COLOR[phase]} onEdit={setEditing} onHide={(r) => hide(r)()} />
                  ) : (
                    <Muted>Nothing here yet. Tap Edit to add items.</Muted>
                  )}
                </Card>
              </View>
            );
          })}
        </View>

        {editMode && (
          <>
            <HiddenItems items={routine.filter((r) => r.archived)}
              onRestore={(r) => act(() => store.routine.update(r.id, { archived: false }))()} />
            <Card title="Tags">
              <Muted>One-tap labels for a night, like insomnia or good dream. Tap one to delete it.</Muted>
              <View style={styles.chips}>
                {tags.map((t) => <Chip key={t.id} label={`${t.name}  ×`} onPress={() => deleteTag(t)} />)}
              </View>
              <AddInput placeholder="New tag" onAdd={(name) => act(() => store.tags.create({ name }))()} />
            </Card>
          </>
        )}
      </ScrollView>
      <RoutineItemEditor item={editing} onClose={() => setEditing(null)} onSaved={() => load()} />
      <CalendarSheet visible={calendarOpen} selected={nightOf} onClose={() => setCalendarOpen(false)}
        onPick={(n) => {
          setCalendarOpen(false);
          goTo(n);
        }} />
    </KeyboardAvoidingView>
  );
}

/** Type a label; optionally pick what else it records. Most items are plain checkboxes. */
function NewRoutineItem({ phase, onCreate }: { phase: Phase; onCreate: (i: Pick<RoutineItem, 'label' | 'phase' | 'kind'>) => void }) {
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
      <Input placeholder={phase === 'bedtime' ? '+ e.g. Turned off computer' : '+ e.g. Stretch'}
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

function HiddenItems({ items, onRestore }: { items: RoutineItem[]; onRestore: (r: RoutineItem) => void }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)}>
        <Muted>{open ? '▴' : '▾'} {items.length} hidden routine item{items.length > 1 ? 's' : ''} (history kept)</Muted>
      </Pressable>
      {open && items.map((r) => (
        <Row key={r.id} label={`${r.label} · ${PHASE_NAME[r.phase].toLowerCase()}`}>
          <Pressable hitSlop={8} onPress={() => onRestore(r)}>
            <Text style={{ color: PHASE_COLOR[r.phase] }}>Restore</Text>
          </Pressable>
        </Row>
      ))}
    </Card>
  );
}

function AddInput({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [value, setValue] = useState('');
  const submit = () => {
    if (value.trim()) onAdd(value.trim());
    setValue('');
  };
  return <Input placeholder={`+ ${placeholder}`} value={value} onChangeText={setValue} onSubmitEditing={submit} returnKeyType="done" />;
}
