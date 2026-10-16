import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { onPulled, requestSync } from '@/db/sync';
import { syncReminders, useReminderTap } from '@/lib/notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useDisplayModeLoaded, useThemeName } from '@/lib/displayMode';
import { colors } from '@/lib/theme';
import { installWebHead } from '@/lib/webHead';
import { useWelcomeSeen } from '@/lib/welcome';

installWebHead();

export default function RootLayout() {
  const welcomeSeen = useWelcomeSeen();
  const theme = useThemeName();
  const displayLoaded = useDisplayModeLoaded();

  useReminderTap(!!welcomeSeen);

  // Re-plan the week's reminders on launch (skips check-ins you've already filled).
  useEffect(() => {
    if (!welcomeSeen) return;
    syncReminders().catch(() => {});
    requestSync(0); // pick up changes from the Google Sheet, if connected
    // A check-in filled on another device arrives through the sheet: drop its reminder here too.
    return onPulled(() => void syncReminders().catch(() => {}));
  }, [welcomeSeen]);

  if (welcomeSeen === null || !displayLoaded) return null; // reading saved settings (a few ms)

  // Until the welcome is finished only the welcome screen exists; finishing it flips the
  // guards and Expo Router moves to the tabs on its own.
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={welcomeSeen}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!welcomeSeen}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}
