// After a sync with the Google Sheet:
//   nights came in (another device, or an edit in the sheet): "From your Google Sheet: 1 new night",
//     for 3 seconds
//   only this device's changes went out: a small "Saved to your Google Sheet ✔️", for a moment
// Either goes sooner with a swipe (sideways or up) or a tap.
import { useEffect, useState } from 'react';
import { Animated, PanResponder, Pressable, Text } from 'react-native';
import { onSheetNews, type SheetNews } from '@/db/sync';
import { colors, space } from '@/lib/theme';

const SHOWN_MS = 3000;
const SAVED_MS = 1500;
const SAVED = 'Saved to your Google Sheet ✔️';

export function sheetNewsText({ added, updated }: Pick<SheetNews, 'added' | 'updated'>): string {
  const nights = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`;
  const parts = [
    added ? `${added} new ${added === 1 ? 'night' : 'nights'}` : '',
    updated ? (added ? `${updated} updated` : `${nights(updated)} updated`) : '',
  ].filter(Boolean);
  return `From your Google Sheet: ${parts.join(', ')}`;
}

export function SheetToast() {
  const [text, setText] = useState<string | null>(null);
  // Made once, and kept for as long as the app runs (the root layout never goes away).
  const [anim] = useState(() => {
    const x = new Animated.Value(0), y = new Animated.Value(0), opacity = new Animated.Value(0);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hide = (to: { x?: number; y?: number } = {}) => {
      if (timer) clearTimeout(timer);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(x, { toValue: to.x ?? 0, duration: 200, useNativeDriver: true }),
        Animated.timing(y, { toValue: to.y ?? -20, duration: 200, useNativeDriver: true }),
      ]).start(() => setText(null));
    };
    const show = (t: string, ms: number) => {
      if (timer) clearTimeout(timer);
      x.setValue(0);
      y.setValue(-20);
      setText(t);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      timer = setTimeout(() => hide(), ms);
    };
    // A swipe sideways or up sends it away; a short drag springs back.
    const pan = PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || g.dy < -8,
      onPanResponderMove: (_, g) => { x.setValue(g.dx); y.setValue(Math.min(0, g.dy)); },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 60) hide({ x: Math.sign(g.dx) * 400, y: 0 });
        else if (g.dy < -30) hide({ y: -80 });
        else Animated.parallel([
          Animated.spring(x, { toValue: 0, useNativeDriver: true }),
          Animated.spring(y, { toValue: 0, useNativeDriver: true }),
        ]).start();
      },
    });
    return { x, y, opacity, hide, show, handlers: pan.panHandlers };
  });

  useEffect(() => onSheetNews((news) => {
    if (news.added || news.updated) anim.show(sheetNewsText(news), SHOWN_MS);
    else anim.show(SAVED, SAVED_MS);
  }), [anim]);

  if (!text) return null;
  if (text === SAVED) {
    return (
      <Animated.View {...anim.handlers} style={{ alignSelf: 'center', opacity: anim.opacity, transform: [{ translateX: anim.x }, { translateY: anim.y }] }}>
        <Pressable onPress={() => anim.hide()} accessibilityRole="alert"
          style={{
            paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: 999,
            backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)', elevation: 4,
          }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{SAVED}</Text>
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Animated.View {...anim.handlers} style={{ opacity: anim.opacity, transform: [{ translateX: anim.x }, { translateY: anim.y }] }}>
      <Pressable onPress={() => anim.hide()} accessibilityRole="alert" accessibilityHint="Tap or swipe to dismiss"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
          backgroundColor: colors.card, borderColor: colors.success, borderWidth: 1, borderRadius: 12,
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)', elevation: 8,
        }}>
        <Text style={{ color: colors.success, fontSize: 16 }}>↓</Text>
        <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}
