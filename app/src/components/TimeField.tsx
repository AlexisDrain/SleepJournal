import { Pressable, Text, View } from 'react-native';
import type { Phase } from '@/lib/types';
import { colors, space } from '@/lib/theme';
import { canSetToNow, formatClockTime, nowOnNight, timeOnNight, toLocalIso, type ClockTime } from '@/lib/time';
import { TimePicker } from './TimePicker';
import { Row } from './ui';

export { TimePicker };

/** A picked clock time as an ISO timestamp on the right calendar day for the night. */
export function pickedOnNight(d: Date, nightOf: string, phase: Phase): string {
  return toLocalIso(timeOnNight(nightOf, d.getHours(), d.getMinutes(), phase));
}

interface Props {
  label: string;
  value: string | null; // ISO
  onChange: (iso: string | null) => void;
  nightOf: string;
  phase: Phase;
  accent: string;
  /** Offered when "now" isn't believable for this field (e.g. filling in a morning that evening). */
  usual: ClockTime;
}

/**
 * A labelled clock-time row. Unset shows "Set to now" when now fits this check-in, otherwise
 * "Set · <your usual time>" as a starting point to adjust; × clears it.
 */
export function TimeField({ label, value, onChange, nightOf, phase, accent, usual }: Props) {
  const now = canSetToNow(nightOf, phase);
  const start = () =>
    onChange(toLocalIso(now ? nowOnNight(nightOf, phase) : timeOnNight(nightOf, usual.hour, usual.minute, phase)));
  return (
    <Row label={label}>
      {value === null ? (
        <Pressable onPress={start} hitSlop={8}>
          <Text style={{ color: accent, fontSize: 16 }}>{now ? 'Set to now' : `Set · ${formatClockTime(usual)}`}</Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <TimePicker value={new Date(value)} accent={accent} onChange={(d) => onChange(pickedOnNight(d, nightOf, phase))} />
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
          </Pressable>
        </View>
      )}
    </Row>
  );
}
