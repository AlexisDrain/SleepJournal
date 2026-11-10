// The notices that float at the top of every screen, stacked so they never overlap: a new version
// to switch to (UpdateBar) and nights just in from the Google Sheet (SheetToast). Taps go through
// to the app wherever there's no notice.
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetToast } from '@/components/SheetToast';
import { UpdateBar } from '@/components/UpdateBar';
import { space } from '@/lib/theme';

export function TopNotices() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{
      position: 'absolute', top: insets.top + space.sm, left: space.md, right: space.md, zIndex: 100, gap: space.sm,
    }}>
      <UpdateBar />
      <SheetToast />
    </View>
  );
}
