// Pick a night from a month calendar. Dots show which nights already have something logged.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { store } from '@/db/store';
import { isFilled } from '@/lib/journal';
import { colors, space } from '@/lib/theme';
import { toDateString } from '@/lib/time';
import { Panel } from './Panel';
import { Button, Muted } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

type Mark = 'full' | 'part';

export function CalendarSheet({ visible, selected, onPick, onClose, allowFuture = false }: {
  visible: boolean;
  selected: string; // night-of date, YYYY-MM-DD
  onPick: (nightOf: string) => void;
  onClose: () => void;
  /** Let coming days be picked too (Routines, to tick or plan ahead). The Journal only looks back. */
  allowFuture?: boolean;
}) {
  const [year, setYear] = useState(() => Number(selected.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(selected.slice(5, 7))); // 1-12
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  // Open on the month of the night being shown.
  useEffect(() => {
    if (!visible) return;
    setYear(Number(selected.slice(0, 4)));
    setMonth(Number(selected.slice(5, 7)));
  }, [visible, selected]);

  useEffect(() => {
    if (!visible) return;
    const prefix = `${year}-${pad(month)}`;
    store
      .listEntries({ from: `${prefix}-01`, to: `${prefix}-31`, limit: 40 })
      .then((entries) =>
        setMarks(Object.fromEntries(entries.map((e) =>
          [e.nightOf, isFilled(e, 'bedtime') && isFilled(e, 'morning') ? 'full' : 'part'] as const))))
      .catch(() => setMarks({}));
  }, [visible, year, month]);

  const move = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const today = toDateString(new Date());
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const title = new Date(year, month - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <Panel visible={visible} onClose={onClose} maxWidth={440}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => move(-1)} hitSlop={12} accessibilityLabel="Previous month">
            <Text style={{ color: colors.muted, fontSize: 24, paddingHorizontal: space.md }}>‹</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          <Pressable onPress={() => move(1)} hitSlop={12} accessibilityLabel="Next month">
            <Text style={{ color: colors.muted, fontSize: 24, paddingHorizontal: space.md }}>›</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>{d}</Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 46 }} />;
            const date = `${year}-${pad(month)}-${pad(day)}`;
            const future = !allowFuture && date > today;
            const isSelected = date === selected;
            const mark = marks[date];
            return (
              <Pressable key={i} disabled={future} onPress={() => onPick(date)}
                accessibilityLabel={`Night of ${date}`}
                style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSelected ? colors.night : 'transparent',
                  borderWidth: date === today && !isSelected ? 1 : 0, borderColor: colors.night,
                }}>
                  <Text style={{ color: isSelected ? colors.bg : future ? colors.cardBorder : colors.text, fontWeight: isSelected ? '700' : '400' }}>
                    {day}
                  </Text>
                  {mark && (
                    <View style={{
                      position: 'absolute', bottom: 3, width: 5, height: 5, borderRadius: 3,
                      backgroundColor: isSelected ? colors.bg : mark === 'full' ? colors.success : colors.morning,
                    }} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Muted>
          Pick the date the night started on. <Text style={{ color: colors.success }}>●</Text> bedtime and morning filled in
          {'  '}<Text style={{ color: colors.morning }}>●</Text> partly
        </Muted>
        <Button title="Close" small onPress={onClose} color={colors.chip} textColor={colors.text} />
    </Panel>
  );
}
