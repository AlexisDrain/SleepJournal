// The web version of SwapSlide. Reanimated's web slide measures a card with its last animation
// still counted, so after a couple of swaps a card starts off screen. offsetLeft / offsetTop ignore
// animations, so this one always starts from the right place.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SWAP_SLIDE_MS } from '@/lib/phaseOrder';

export function SwapSlide({ sliding, style, children }: { sliding: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const was = useRef<{ x: number; y: number } | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const now = { x: el.offsetLeft, y: el.offsetTop };
    const from = was.current;
    was.current = now;
    if (!sliding || !from || (from.x === now.x && from.y === now.y)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animation.current?.cancel();
    animation.current = el.animate(
      [{ transform: `translate(${from.x - now.x}px, ${from.y - now.y}px)` }, { transform: 'none' }],
      { duration: SWAP_SLIDE_MS, easing: 'ease' },
    );
  });

  return <View ref={ref as never} style={style}>{children}</View>; // on web, a View's ref is its element
}
