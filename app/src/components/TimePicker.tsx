import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text } from 'react-native';
import { useHour24 } from '@/lib/clockFormat';
import { formatClock } from '@/lib/time';

/** Just the tappable clock time: iOS inline compact picker, Android dialog. (Web: TimePicker.web.tsx) */
export function TimePicker({ value, onChange, accent }: { value: Date; onChange: (d: Date) => void; accent: string }) {
  const hour24 = useHour24();
  if (Platform.OS === 'ios') {
    return (
      // iOS takes the 12/24-hour style from a locale: en_GB shows 23:30, en_US shows 11:30 PM.
      <DateTimePicker value={value} mode="time" display="compact" minuteInterval={5} themeVariant="dark"
        locale={hour24 ? 'en_GB' : 'en_US'}
        accentColor={accent} onValueChange={(_, d) => onChange(d)} />
    );
  }
  return (
    <Pressable hitSlop={8}
      onPress={() => DateTimePickerAndroid.open({ value, mode: 'time', is24Hour: hour24, onValueChange: (_, d) => onChange(d) })}>
      <Text style={{ color: accent, fontSize: 17, fontWeight: '600' }}>{formatClock(value.toISOString())}</Text>
    </Pressable>
  );
}
