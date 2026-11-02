import { useLayoutEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { onThemeChange } from '../lib/displayMode';
import { colors, radius, space } from '../lib/theme';
import { TEXT_MAX } from '../lib/types';

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.card}>
      {(title || right) && (
        <View style={styles.cardHeader}>
          {title && <Text style={styles.cardTitle}>{title}</Text>}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

export function Button({
  title,
  onPress,
  color = colors.night,
  textColor = colors.bg,
  disabled,
  busy,
  small,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }, small && { fontSize: 14 }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color = colors.night }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: color, borderColor: color }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.bg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export { TEXT_MAX } from '../lib/types';

export function Input(props: TextInputProps) {
  // Phones grow a box of several lines with its text; a browser doesn't, so there it's sized by hand
  // (straight on the page: going through React state makes the browser box resize itself in a loop).
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  const growOnWeb = Platform.OS === 'web' && !!props.multiline;
  useLayoutEffect(() => {
    const el = box.current as unknown as HTMLTextAreaElement | null;
    if (!growOnWeb || !el?.style) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`; // plus the border
  }, [growOnWeb, props.value]);
  return (
    <TextInput
      ref={box}
      placeholderTextColor={colors.muted}
      {...props}
      // A long text doesn't push the rest of the page down: past this height the box scrolls.
      style={[styles.input, props.multiline && { minHeight: 72, maxHeight: 200, textAlignVertical: 'top' }, props.style]}
    />
  );
}

/** A box for a dream or a note: several lines, up to TEXT_MAX, with a count once it's nearly full. */
export function LongTextInput(props: TextInputProps) {
  const length = props.value?.length ?? 0;
  return (
    <View style={{ gap: space.xs }}>
      <Input multiline maxLength={TEXT_MAX} {...props} />
      {length >= TEXT_MAX * 0.9 && (
        <Text style={[styles.muted, { textAlign: 'right' }]}>{length.toLocaleString()} / {TEXT_MAX.toLocaleString()} characters</Text>
      )}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <Text style={{ color: colors.danger, marginBottom: onRetry ? space.md : 0 }}>{message}</Text>
      {onRetry && <Button title="Retry" onPress={onRetry} small />}
    </Card>
  );
}

// Built from the current colors, and built again when the display changes (dark / light).
const makeStyles = () => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, gap: space.md },
  rowValue: { flexShrink: 0, alignItems: 'flex-end' },
  label: { color: colors.text, fontSize: 16, flexShrink: 1 },
  button: { borderRadius: radius, paddingVertical: 14, paddingHorizontal: space.lg, alignItems: 'center' },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.chip,
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  chipText: { color: colors.text, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  muted: { color: colors.muted, fontSize: 14 },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: 48 },
});

export let styles = makeStyles();
onThemeChange(() => {
  styles = makeStyles();
});
