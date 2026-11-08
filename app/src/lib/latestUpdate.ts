// The newest version, without surprises. By default an installed app downloads a new update
// (`node scripts/release.js phone`) in the background and only switches to it the next time it
// starts from scratch, so people saw the older version for a while. Here the app looks for an
// update when it opens and each time it comes back from the background. Once one has downloaded,
// it offers it (UpdateBar: "Update app" / "Later") and never restarts on its own: a restart while
// someone is typing a dream, or in the middle of an import, would lose their work. If they never
// tap it, the phone still switches to the new version the next time the app starts from scratch.
// Not in Expo Go (it loads the newest update itself) or in development. The web is always current:
// see latestUpdate.web.ts.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Typing is saved half a second after it stops: wait a bit longer before restarting. */
const SETTLE_MS = 900;
const active = !__DEV__ && Updates.isEnabled && Constants.executionEnvironment !== 'storeClient';

let ready = false; // a new update has downloaded
let hidden = false; // "Later": not offered again until the app comes back
let checking = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
const offered = () => ready && !hidden;

async function getNewest() {
  if (checking || ready) return;
  checking = true;
  try {
    if (!(await Updates.checkForUpdateAsync()).isAvailable) return;
    if (!(await Updates.fetchUpdateAsync()).isNew) return;
    ready = true;
    changed();
  } catch {
    // offline, or asked too often: next time
  } finally {
    checking = false;
  }
}

/** Looks for updates. Call once, in the root layout. */
export function useLatestUpdate() {
  useEffect(() => {
    if (!active) return;
    void getNewest();
    let last: AppStateStatus | null = AppState.currentState as AppStateStatus | null;
    const sub = AppState.addEventListener('change', (state) => {
      // Only a real return from the background: not the brief "inactive" of Notification Center, a
      // banner, Face ID, the share sheet or a file picker.
      const back = state === 'active' && last === 'background';
      last = state;
      if (!back) return;
      if (ready && hidden) {
        hidden = false; // offer it again
        changed();
      } else void getNewest();
    });
    return () => sub.remove();
  }, []);
}

/** True while a downloaded update is waiting to be offered. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, offered, offered);
}

/** "Update app": restarts into the new version, once anything just typed has been saved. */
export async function applyUpdate(): Promise<void> {
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  await Updates.reloadAsync();
}

/** "Later": hides the offer until the app next comes back from the background. */
export function laterUpdate() {
  hidden = true;
  changed();
}
