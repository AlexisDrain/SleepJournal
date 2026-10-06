// Web only: point the page at the home-screen icons and web-app manifest in /public.
// (Expo's single-page web export doesn't write these tags itself.)
import { Platform } from 'react-native';
import { colors } from './theme';

export function installWebHead() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const key = attrs.rel ?? attrs.name;
    if (document.head.querySelector(`${tag}[${attrs.rel ? 'rel' : 'name'}="${key}"]`)) return;
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  };
  add('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }); // iPhone "Add to Home Screen"
  add('link', { rel: 'manifest', href: '/manifest.json' }); // installable web app (Chrome, Android)
  add('meta', { name: 'theme-color', content: colors.bg });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Sleep Journal' });
}
