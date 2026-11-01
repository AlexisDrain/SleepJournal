// The tabs on the phone app. The usual tab view hides every page but one, so a page can't follow your
// finger with the next one beside it. This has the same routes, title and bottom bar, but the four
// tabs in the bar are pages side by side that all stay drawn, and `position` slides them. It counts
// in pages (1.5 = halfway between Routines and Stats). Dreams and Sheet open on top of them, and close again when you leave.
// Not on the web, where catching sideways drags would stop tables scrolling.
import { StyleSheet, Platform, View, useWindowDimensions } from 'react-native';
import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { makeMutable, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createStandardNavigator } from 'standard-navigation';
import { createBaseTabProps } from 'expo-router/build/layouts/createBaseTabProps';
import { TabRouter } from 'expo-router/build/react-navigation/native/index';
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs/index';
import { getHeaderTitle, Header, SafeAreaProviderCompat } from 'expo-router/build/react-navigation/elements/index';
import { integrateWithRouter } from 'expo-router/build/standard-navigation/index';
import { appendMissingPlaceholderTabDescriptors, appendMissingPlaceholderTabRoutes } from 'expo-router/build/standard-navigation/appendMissingPlaceholderTabRoutes';
import { usePreloadPlaceholderRoutes } from 'expo-router/build/standard-navigation/usePreloadPlaceholderRoutes';
import { useReconcileTabHistory } from 'expo-router/build/standard-navigation/useReconcileTabHistory';
import { useVisibleTabsWithRedirect } from 'expo-router/build/standard-navigation/useVisibleTabsWithRedirect';
import { colors } from '@/lib/theme';

const PAGES = ['index', 'routines', 'stats', 'settings'];
const LAST = PAGES.length - 1;
export const SETTLE_MS = 220;
const TURN_SHARE = 0.3; // how much of the screen a slow drag has to cover
const FLICK_SPEED = 600; // or a quick flick, in pixels a second

const position = makeMutable(0);
let swipedTo: number | null = null; // already sliding there, so arriving mustn't jump

const sideScroll = Gesture.Native();

/** Goes around a sideways scroller, so scrolling it doesn't change tabs. */
export function SideScroll({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') return children;
  return <GestureDetector gesture={sideScroll}>{children}</GestureDetector>;
}

function Page({ index, width, shown, children }: { index: number; width: number; shown: boolean; children: ReactNode }) {
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: (index - position.value) * width }] }), [index, width]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, slide]}
      accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      {children}
    </Animated.View>
  );
}

// The props come from Expo Router's navigator, as for its own tab view (createBottomTabNavigator).
function PhoneTabsView({ state, descriptors, actions, emitter, routeNames, preload }: any) {
  useReconcileTabHistory();
  const { visibleRoutes: routes, focusedIndex, focusedFallbackRoute } = useVisibleTabsWithRedirect({
    routes: state.routes, routeNames, focusedRouteKey: state.routes[state.index]?.key, descriptors,
  });
  usePreloadPlaceholderRoutes({ routes, descriptors, preload, lazyByDefault: true });
  const { width } = useWindowDimensions();
  const focused = routes[focusedIndex];
  const at = focused ? PAGES.indexOf(focused.name) : -1;

  // Reached by the bottom bar: there at once. A swipe is already sliding there.
  useLayoutEffect(() => {
    if (at < 0) return;
    if (swipedTo !== at) position.value = at;
    swipedTo = null;
  }, [at]);

  const navigateToTab = (key: string) => {
    const route = state.routes.find((r: { key: string }) => r.key === key);
    if (route) actions.navigate(route.name, route.params);
  };
  const latest = useRef(navigateToTab);
  latest.current = navigateToTab;
  const keyOf = useRef(routes);
  keyOf.current = routes;
  const go = useCallback((page: number) => {
    swipedTo = page;
    const route = keyOf.current.find((r: { name: string }) => r.name === PAGES[page]);
    if (route) latest.current(route.key);
  }, []);

  const swipe = useMemo(() => Gesture.Pan()
    .enabled(at >= 0)
    .activeOffsetX([-20, 20]) // a clear sideways move, and scrolling up or down cancels it
    .failOffsetY([-20, 20])
    .requireExternalGestureToFail(sideScroll)
    .onUpdate((e) => {
      position.value = Math.max(Math.max(0, at - 1), Math.min(Math.min(LAST, at + 1), at - e.translationX / width));
    })
    .onEnd((e) => {
      const turn = Math.abs(e.translationX) > width * TURN_SHARE || Math.abs(e.velocityX) > FLICK_SPEED;
      const page = turn ? Math.max(0, Math.min(LAST, at + (e.translationX < 0 ? 1 : -1))) : at;
      position.value = withTiming(page, { duration: SETTLE_MS });
      if (page !== at) scheduleOnRN(go, page);
    }), [at, width, go]);

  if (focusedFallbackRoute) return descriptors[focusedFallbackRoute.key]?.render() ?? null;
  if (!focused) return null;
  const options = descriptors[focused.key].options;
  const tabState = { ...state, routes, index: focusedIndex };

  return (
    <SafeAreaProviderCompat>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header {...options} title={getHeaderTitle(options, focused.name)} />
        <GestureDetector gesture={swipe}>
          <View collapsable={false} style={{ flex: 1, overflow: 'hidden' }}>
            {PAGES.map((name, i) => {
              const route = routes.find((r: { name: string }) => r.name === name);
              return <Page key={name} index={i} width={width} shown={i === at}>{route && descriptors[route.key]?.render()}</Page>;
            })}
            {/* Dreams and Sheet exist only while open, so their long lists don't stay in memory. */}
            {at < 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>{descriptors[focused.key]?.render()}</View>}
          </View>
        </GestureDetector>
        <SafeAreaInsetsContext.Consumer>
          {(insets) => <BottomTabBar state={tabState} descriptors={descriptors} emitter={emitter} navigateToTab={navigateToTab}
            insets={insets ?? { top: 0, right: 0, bottom: 0, left: 0 }} />}
        </SafeAreaInsetsContext.Consumer>
      </View>
    </SafeAreaProviderCompat>
  );
}

// Set up as Expo Router sets up its own Tabs (TabsClient), with this view instead of its tab view.
export const PhoneTabs: any = integrateWithRouter(createStandardNavigator(PhoneTabsView) as any, TabRouter as any, {
  activityDefaultThreshold: 1,
  processDescriptors: appendMissingPlaceholderTabDescriptors,
  processState: appendMissingPlaceholderTabRoutes,
  createProps: createBaseTabProps,
} as any);
