// The notices that float at the top of every screen, stacked so they never overlap: a new version
// to switch to (UpdateBar) and nights just in from the Google Sheet (SheetToast). Taps go through
// to the app wherever there's no notice. Centered, and only as wide as their words (at most
// MAX_WIDTH, so they don't stretch across a computer screen).
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetToast } from '@/components/SheetToast';
import { UpdateBar } from '@/components/UpdateBar';
import { space } from '@/lib/theme';

const MAX_WIDTH = 460;

export function TopNotices() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{
      position: 'absolute', top: insets.top + space.sm, left: space.md, right: space.md, zIndex: 100, alignItems: 'center',
    }}>
      <View pointerEvents="box-none" style={{ width: '100%', maxWidth: MAX_WIDTH, alignItems: 'center', gap: space.sm }}>
        <UpdateBar />
        <SheetToast />
      </View>
    </View>
  );
}
