import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Phase, RoutineItem, RoutineValue, Tag } from '@/lib/types';
import { colors, space } from '@/lib/theme';
import { addDays, formatDuration, nightLabel, nowOnNight, shortDate, toLocalIso } from '@/lib/time';
import { SwipeRow } from './SwipeRow';
import { pickedOnNight, TimePicker } from './TimeField';
import { Chip, Input, Muted, styles } from './ui';

/**
 * "‹  Friday night → Saturday  ›". Arrows step a night at a time, tapping the date opens the
 * calendar, and "Today" (shown when you're looking at another night) jumps back to what's due now.
 */
export function NightSwitcher({ nightOf, onChange, onOpenCalendar, onToday }: {
  nightOf: string;
  onChange: (n: string) => void;
  onOpenCalendar: () => void;
  onToday: (() => void) | null;
}) {
  const arrow = (days: number, glyph: string, label: string) => (
    <Pressable onPress={() => onChange(addDays(nightOf, days))} hitSlop={12} style={{ padding: space.sm }} accessibilityLabel={label}>
      <Text style={{ color: colors.muted, fontSize: 24 }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ marginBottom: space.lg, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {arrow(-1, '‹', 'Previous night')}
        <Pressable onPress={onOpenCalendar} style={{ alignItems: 'center' }} accessibilityRole="button" accessibilityLabel="Choose a night from the calendar">
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{nightLabel(nightOf)}</Text>
          <Muted>{shortDate(nightOf)}  ▾</Muted>
        </Pressable>
        {arrow(1, '›', 'Next night')}
      </View>
      {onToday && (
        <View style={{ alignItems: 'center' }}>
          <Chip label="↩ Today" onPress={onToday} />
        </View>
      )}
    </View>
  );
}

export const RESTED_LABELS = ['Exhausted', 'Tired', 'Okay', 'Rested', 'Great'];

/** One 1-5 scale for "how did you sleep / how rested are you". */
export function RestedScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {RESTED_LABELS.map((label, i) => {
          const n = i + 1;
          const selected = n === value;
          return (
            <Pressable key={n} onPress={() => onChange(n)} accessibilityLabel={label}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: 10,
                backgroundColor: selected ? colors.morning : colors.chip,
                borderWidth: 1, borderColor: selected ? colors.morning : colors.cardBorder,
              }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: selected ? colors.bg : colors.text }}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Muted>Exhausted</Muted>
        <Text style={{ color: colors.morning, fontWeight: '600' }}>{RESTED_LABELS[value - 1]}</Text>
        <Muted>Well rested</Muted>
      </View>
    </View>
  );
}

const LATENCY_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

const LONG_DEFAULT = 240; // what "3h+" starts at
const LONG_MAX = 12 * 60;

/** Preset durations, plus "3h+" for rough nights with a − / + to say how long. */
export function LatencyPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const long = value !== null && value > 180;
  const step = (delta: number) => value !== null && onChange(Math.min(LONG_MAX, Math.max(210, value + delta)));
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.chips}>
        {LATENCY_OPTIONS.map((m) => (
          <Chip key={m} label={m < 60 ? `${m}m` : `${m / 60}h`} selected={value === m} color={colors.morning}
            onPress={() => onChange(value === m ? null : m)} />
        ))}
        <Chip label="3h+" selected={long} color={colors.morning} onPress={() => onChange(long ? null : LONG_DEFAULT)} />
      </View>
      {long && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Chip label="  −  " onPress={() => step(-30)} />
          <Text style={{ color: colors.morning, fontSize: 17, fontWeight: '600' }}>{formatDuration(value)}</Text>
          <Chip label="  +  " onPress={() => step(30)} />
        </View>
      )}
    </View>
  );
}

/** Toggle existing tags, or type a new one. */
export function TagPicker({ all, selected, onChange }: { all: Tag[]; selected: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const names = [...new Set([...all.map((t) => t.name), ...selected])].sort();
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name]);
  const add = () => {
    const name = draft.trim().toLowerCase();
    if (name && !selected.includes(name)) onChange([...selected, name]);
    setDraft('');
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.chips}>
        {names.map((n) => (
          <Chip key={n} label={n} selected={selected.includes(n)} onPress={() => toggle(n)} color={colors.morning} />
        ))}
      </View>
      <Input placeholder="+ new tag" value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" />
    </View>
  );
}

/**
 * The routine: one checklist where some items also record something.
 *   check  → just a checkbox
 *   time   → checking it stamps the current time, which you can then adjust
 *   number → checking it shows a number box
 *   text   → checking it shows a text box
 * Drag a row left to edit or hide the item itself.
 */
export function Routine({ items, values, onChange, nightOf, phase, accent, onEdit, onHide }: {
  items: RoutineItem[];
  values: Record<string, RoutineValue>;
  onChange: (id: number, v: RoutineValue) => void;
  nightOf: string;
  phase: Phase;
  accent: string;
  onEdit: (item: RoutineItem) => void;
  onHide: (item: RoutineItem) => void;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({}); // number/text items checked but still empty
  if (!items.length) return <Muted>Nothing here yet. Add items in the Routines tab.</Muted>;

  return (
    <View>
      {items.map((item) => {
        const v = values[item.id] ?? null;
        const done = (v !== null && v !== false) || !!open[item.id];
        const toggle = () => {
          if (done) {
            setOpen((o) => ({ ...o, [item.id]: false }));
            return onChange(item.id, null);
          }
          if (item.kind === 'check') return onChange(item.id, true);
          if (item.kind === 'time') return onChange(item.id, toLocalIso(nowOnNight(nightOf, phase)));
          setOpen((o) => ({ ...o, [item.id]: true }));
        };
        return (
          <SwipeRow key={item.id} onEdit={() => onEdit(item)} onHide={() => onHide(item)}>
            <View style={{ paddingVertical: space.sm, gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Pressable onPress={toggle} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
                  <View style={{
                    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: accent,
                    backgroundColor: done ? accent : 'transparent', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done && <Text style={{ color: colors.bg, fontWeight: '800' }}>✓</Text>}
                  </View>
                  <Text style={{ color: done ? colors.muted : colors.text, fontSize: 16, flexShrink: 1 }}>{item.label}</Text>
                </Pressable>
                {item.kind === 'time' && typeof v === 'string' && (
                  <TimePicker value={new Date(v)} accent={accent}
                    onChange={(d) => onChange(item.id, pickedOnNight(d, nightOf, phase))} />
                )}
                {item.kind === 'number' && done && (
                  <Input style={{ width: 80, textAlign: 'right', paddingVertical: 6 }} keyboardType="decimal-pad"
                    autoFocus={v === null} value={v === null ? '' : String(v)}
                    onChangeText={(t) => onChange(item.id, t === '' || Number.isNaN(Number(t)) ? null : Number(t))} />
                )}
              </View>
              {item.kind === 'text' && done && (
                <Input autoFocus={v === null} value={typeof v === 'string' ? v : ''} placeholder={item.label}
                  onChangeText={(t) => onChange(item.id, t || null)} />
              )}
            </View>
          </SwipeRow>
        );
      })}
    </View>
  );
}
