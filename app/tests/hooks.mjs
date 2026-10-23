// Runs the app's code in plain Node for the tests: Expo's native modules are swapped for small
// in-memory stand-ins (tests/stubs). Loaded with `node --import ./tests/hooks.mjs`.
import { registerHooks } from 'node:module';

const stub = (name) => new URL(`./stubs/${name}.cjs`, import.meta.url).href;
const STUBS = {
  'expo-sqlite': stub('sqlite'),
  'expo-file-system': stub('empty'),
  'expo-sharing': stub('empty'),
  'expo-document-picker': stub('empty'),
  'expo-notifications': stub('notif'),
  'expo-secure-store': stub('securestore'),
  'expo-router': stub('router'),
  '@react-native-async-storage/async-storage': stub('storage'),
  'react-native': stub('rn'),
};

registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: STUBS[specifier], format: 'commonjs', shortCircuit: true };
    return next(specifier, context);
  },
});
