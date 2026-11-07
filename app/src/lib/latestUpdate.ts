// The newest version, right away. By default an installed app downloads a new update
// (`node scripts/release.js phone`) in the background and only switches to it the next time it
// starts, so people saw the older version once more. Here the app looks for an update when it
// opens and each time it comes back. If one finishes downloading soon after that (within
// GRACE_MS), the app restarts into it at once: the person has only just arrived, so nothing is
// lost. If it takes longer, it waits for the next time the app comes back, so it never restarts in
// the middle of something.
// Not in Expo Go (it loads the newest update itself) or in development. The web is always current:
// see latestUpdate.web.ts.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

const GRACE_MS = 15_000;
const active = !__DEV__ && Updates.isEnabled && Constants.executionEnvironment !== 'storeClient';
const launchedAt = Date.now(); // this file loads as the app starts
let downloaded = false; // a new update is waiting for the next time the app comes back

async function getNewest(arrivedAt: number) {
  try {
    if (!(await Updates.checkForUpdateAsync()).isAvailable) return;
    if (!(await Updates.fetchUpdateAsync()).isNew) return;
    if (Date.now() - arrivedAt < GRACE_MS) await Updates.reloadAsync();
    else downloaded = true;
  } catch {
    // offline, or asked too often: next time
  }
}

export function useLatestUpdate() {
  useEffect(() => {
    if (!active) return;
    void getNewest(launchedAt);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (downloaded) Updates.reloadAsync().catch(() => {});
      else void getNewest(Date.now());
    });
    return () => sub.remove();
  }, []);
}
