// "A new version is ready": shown at the top of the screen once an update has downloaded (see
// latestUpdate.ts). The app never restarts by itself; this lets the person choose when.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { applyUpdate, laterUpdate, useUpdateReady } from '@/lib/latestUpdate';
import { colors, space } from '@/lib/theme';

export function UpdateBar() {
  const ready = useUpdateReady();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  const update = async () => {
    setBusy(true);
    await applyUpdate().catch(() => setBusy(false)); // it restarts; if it can't, the button comes back
  };
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute', top: insets.top + space.sm, left: space.md, right: space.md, zIndex: 100,
        flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, paddingLeft: space.md,
        backgroundColor: colors.card, borderColor: colors.night, borderWidth: 1, borderRadius: 12,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)', elevation: 8,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>A new version is ready</Text>
      <Button title="Later" small disabled={busy} color={colors.chip} textColor={colors.text} onPress={laterUpdate} />
      <Button title="Update app" small busy={busy} onPress={() => void update()} />
    </View>
  );
}
