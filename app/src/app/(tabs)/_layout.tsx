import { router, Tabs } from 'expo-router';
import { Platform, Pressable, Text, type ColorValue } from 'react-native';
import { PhoneTabs } from '@/components/PhoneTabs';
import { colors, space } from '@/lib/theme';
import { useThemeName } from '@/lib/displayMode';
import { useWide } from '@/lib/useLayout';

// \uFE0E asks for the plain text glyph: without it iPhones draw ⚙ as an emoji, which ignores `color`.
const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph + '\uFE0E'}</Text>;

/** Dreams and Sheet are opened from the Stats page: a way back to it. */
const backToStats = () => (
  <Pressable onPress={() => router.navigate('/stats')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to Stats"
    style={{ paddingHorizontal: space.lg }}>
    <Text style={{ color: colors.night, fontSize: 16, fontWeight: '600' }}>‹ Stats</Text>
  </Pressable>
);

export default function TabsLayout() {
  useThemeName(); // redraw when the display changes (dark / light)
  const wide = useWide();
  // Phone app: the four tabs are pages you can drag between (see PhoneTabs), so all of them stay ready.
  const pages = Platform.OS !== 'web' && !wide;
  const Nav = pages ? PhoneTabs : Tabs;
  // Phones keep four tabs along the bottom; Dreams and Sheet are buttons on the Stats page instead.
  // Wide screens have room for all six in the rail down the left.
  // (Hidden by drawing no button, not with href: null, which on SDK 58 also made the page unreachable.)
  const fromStats = wide
    // Wide: indented under Stats, slightly smaller, to show they belong to it.
    ? { tabBarItemStyle: { marginLeft: 28 }, tabBarLabelStyle: { fontSize: 13 }, headerLeft: backToStats }
    : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const }, headerLeft: backToStats, lazy: true };
  return (
    <Nav
      screenOptions={{
        lazy: !pages,
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
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: icon('▥') }} />
      <Tabs.Screen name="dreams" options={{ title: 'Dreams', tabBarIcon: icon('☁'), ...fromStats }} />
      <Tabs.Screen name="sheet" options={{ title: 'Sheet', tabBarIcon: icon('▦'), ...fromStats }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
    </Nav>
  );
}
