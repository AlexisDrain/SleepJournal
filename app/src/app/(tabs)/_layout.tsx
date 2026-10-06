import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/lib/theme';
import { useWide } from '@/lib/useLayout';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  const wide = useWide();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        // Phones: a bar along the bottom. Wide screens: a navigation rail down the left side.
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarStyle: {
          backgroundColor: colors.card, borderTopColor: colors.cardBorder, borderRightColor: colors.cardBorder,
          ...(wide && { paddingTop: 16, minWidth: 96 }),
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journal', tabBarIcon: icon('☾') }} />
      <Tabs.Screen name="routines" options={{ title: 'Routines', tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="sheet" options={{ title: 'Sheet', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
