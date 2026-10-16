// The app's colors. Dark by default (it's mostly opened in bed); Settings → Display can switch to
// light, or to "auto": light during the day, dark in the evening and night (see displayMode.ts).
//
// `colors` is one shared object whose values are swapped when the display changes, so code keeps
// reading `colors.text` and simply gets the current value the next time it draws.

const DARK = {
  bg: '#0e1120',
  card: '#181c33',
  cardBorder: '#262b4a',
  text: '#e8eaf6',
  muted: '#8a90b2',
  night: '#9fa8ff',
  morning: '#ffc47a',
  danger: '#ff7b86',
  success: '#7be0a8',
  successBg: '#15241f', // card tint for a filled-in check-in
  chip: '#232846',
};

const LIGHT: typeof DARK = {
  bg: '#f3f4fa',
  card: '#ffffff',
  cardBorder: '#d9dcec',
  text: '#1a1d33',
  muted: '#5f6688',
  night: '#4c57c9', // darker accents, so they read on white (and white text reads on them)
  morning: '#b26a00',
  danger: '#c8323f',
  success: '#1c8a55',
  successBg: '#e3f4ea',
  chip: '#e9ebf6',
};

export type ThemeName = 'dark' | 'light';

export const colors = { ...DARK };

/** Spreadsheet column colors (the Sheet tab): [header, cell] per group. */
type Tints = Record<'other' | 'bedtime' | 'morning', [string, string]>;
const DARK_TINTS: Tints = { other: ['#1f3d30', '#14211b'], bedtime: ['#2a3170', '#171b38'], morning: ['#57431d', '#231d12'] };
const LIGHT_TINTS: Tints = { other: ['#c7ebd5', '#eef8f2'], bedtime: ['#d2d8ff', '#eef0fd'], morning: ['#ffe0a3', '#fff7e6'] };
export const tints: Tints = { ...DARK_TINTS };

let current: ThemeName = 'dark';
export const themeName = () => current;

/** Swap every color to the given theme. Screens redraw through useThemeName() (displayMode.ts). */
export function applyTheme(name: ThemeName) {
  current = name;
  Object.assign(colors, name === 'light' ? LIGHT : DARK);
  Object.assign(tints, name === 'light' ? LIGHT_TINTS : DARK_TINTS);
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = 12;
