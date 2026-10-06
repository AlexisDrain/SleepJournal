// Responsive layout: one column on phones, more room used on tablets and computer screens.
import { useWindowDimensions } from 'react-native';

/** Screens at least this wide get the sidebar and side-by-side layouts. */
export const WIDE_FROM = 900;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_FROM;
}

/** Centers a page's content and stops it stretching past `max` pixels. */
export const page = (max: number) => ({ width: '100%' as const, maxWidth: max, alignSelf: 'center' as const });

/** Reading width for single-column pages (settings, forms). */
export const NARROW_PAGE = 640;
/** Width for pages that lay things out side by side on wide screens. */
export const WIDE_PAGE = 1100;
