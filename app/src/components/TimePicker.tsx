import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text } from 'react-native';
import { formatClock } from '@/lib/time';

/** Just the tappable clock time: iOS inline compact picker, Android dialog. (Web: TimePicker.web.tsx) */
export function TimePicker({ value, onChange, accent }: { value: Date; onChange: (d: Date) => void; accent: string }) {
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker value={value} mode="time" display="compact" minuteInterval={5} themeVariant="dark"
        accentColor={accent} onValueChange={(_, d) => onChange(d)} />
    );
  }
  return (
    <Pressable hitSlop={8}
      onPress={() => DateTimePickerAndroid.open({ value, mode: 'time', onValueChange: (_, d) => onChange(d) })}>
      <Text style={{ color: accent, fontSize: 17, fontWeight: '600' }}>{formatClock(value.toISOString())}</Text>
    </Pressable>
  );
}
