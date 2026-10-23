// Naps for the day after a night (the day you woke up into), shown in the Journal under Morning.
// Start a nap with one tap, end it with another.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { store } from '@/db/store';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, space } from '@/lib/theme';
import { addDays, formatClock, formatDuration, shortDate, toDateString, toLocalIso } from '@/lib/time';
import type { Nap } from '@/lib/types';
import { Button, Muted } from './ui';

const FORGOTTEN_AFTER_MS = 4 * 3_600_000;

export function NapsCard({ nightOf }: { nightOf: string }) {
  const day = addDays(nightOf, 1);
  const isToday = day === toDateString(new Date());
  const [naps, setNaps] = useState<Nap[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNaps(await store.naps.list());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = naps.find((n) => n.endAt === null); // a nap in progress, whichever day you're looking at
  // A nap "in progress" for hours was most likely never ended: offer to drop it instead of
  // recording a nap that lasted until now.
  const forgotten = open && Date.now() - Date.parse(open.startAt) > FORGOTTEN_AFTER_MS;
  const thatDay = naps.filter((n) => n.endAt !== null && n.startAt.slice(0, 10) === day);
  const remove = async (nap: Nap) => {
    if (await confirmAction('Delete nap?', undefined, 'Delete')) run(() => store.naps.remove(nap.id));
  };

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder,
      padding: space.lg, gap: space.md, marginBottom: space.md,
    }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Naps · {shortDate(day)}
      </Text>
      {open ? (
        <>
          <Text style={{ color: colors.text }}>
            Napping since {open.startAt.slice(0, 10) === toDateString(new Date()) ? '' : `${shortDate(open.startAt.slice(0, 10))}, `}{formatClock(open.startAt)}
          </Text>
          {forgotten && <Muted>That was over 4 hours ago. If you forgot to end it, delete it.</Muted>}
          <Button title="Woke up from nap" small busy={busy} color={colors.morning}
            onPress={() => run(() => store.naps.update(open.id, { endAt: toLocalIso(new Date()) }))} />
          {forgotten && (
            <Button title="Delete this nap" small busy={busy} color={colors.chip} textColor={colors.text}
              onPress={() => remove(open)} />
          )}
        </>
      ) : isToday ? (
        <Button title="Start a nap now" small busy={busy} color={colors.chip} textColor={colors.text}
          onPress={() => run(() => store.naps.create({ startAt: toLocalIso(new Date()), note: null }))} />
      ) : null}
      {thatDay.map((n) => {
        const mins = Math.round((Date.parse(n.endAt!) - Date.parse(n.startAt)) / 60000);
        return (
          <View key={n.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 16 }}>
              {formatClock(n.startAt)} – {formatClock(n.endAt)}  <Text style={{ color: colors.muted }}>({formatDuration(mins)})</Text>
            </Text>
            <Pressable onPress={() => remove(n)} hitSlop={8} accessibilityLabel="Delete nap">
              <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
        );
      })}
      {thatDay.length === 0 && !open && !isToday && <Muted>No naps that day.</Muted>}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}
