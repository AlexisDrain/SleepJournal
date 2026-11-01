import { useRef, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors, space } from '@/lib/theme';
import { useWide } from '@/lib/useLayout';

/** Drag a row to the left to reveal Edit / Hide. Not on phones, where a sideways drag changes tabs: Edit does both there. */
export function SwipeRow({ children, onEdit, onHide }: { children: ReactNode; onEdit: () => void; onHide: () => void }) {
  const ref = useRef<SwipeableMethods>(null);
  const wide = useWide();
  const action = (label: string, color: string, fn: () => void) => (
    <Pressable
      onPress={() => {
        ref.current?.close();
        fn();
      }}
      style={{ backgroundColor: color, justifyContent: 'center', paddingHorizontal: space.lg }}
    >
      <Text style={{ color: colors.bg, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  if (Platform.OS !== 'web' && !wide) return children;
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.5}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <View style={{ flexDirection: 'row' }}>
          {action('Edit', colors.night, onEdit)}
          {action('Hide', colors.danger, onHide)}
        </View>
      )}
    >
      <View style={{ backgroundColor: colors.card }}>{children}</View>
    </ReanimatedSwipeable>
  );
}
