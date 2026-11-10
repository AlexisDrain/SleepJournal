// The notices that float at the top of every screen, stacked so they never overlap: a new version
// to switch to (UpdateBar) and nights just in from the Google Sheet (SheetToast). Taps go through
// to the app wherever there's no notice. They're only as wide as their words: on a phone, centered;
// on a wide screen, in the top right corner, clear of the side menu.
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetToast } from '@/components/SheetToast';
import { UpdateBar } from '@/components/UpdateBar';
import { space } from '@/lib/theme';
import { useWide } from '@/lib/useLayout';

export function TopNotices() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <View pointerEvents="box-none" style={{
      position: 'absolute', top: insets.top + space.sm, right: space.md, zIndex: 100, gap: space.sm,
      ...(wide ? { maxWidth: 380, alignItems: 'flex-end' as const } : { left: space.md, alignItems: 'center' as const }),
    }}>
      <UpdateBar />
      <SheetToast />
    </View>
  );
}
