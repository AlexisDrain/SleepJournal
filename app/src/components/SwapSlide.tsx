// A Bedtime or Morning section that slides to its new place when Swap is pressed. It's switched on
// only during a swap, so folding a section or adding a routine item doesn't move anything.
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SWAP_SLIDE_MS } from '@/lib/phaseOrder';

const SLIDE = LinearTransition.duration(SWAP_SLIDE_MS);

export function SwapSlide({ sliding, style, children }: { sliding: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <Animated.View layout={sliding ? SLIDE : undefined} style={style}>{children}</Animated.View>;
}
