// Android APKs from GitHub Releases only: is a newer APK out? Over-the-air updates can't deliver
// native changes, so those need a new install. Asks GitHub's public API at most once a day and
// sends nothing about you or your journal. Can be switched off in Settings → About.
//
// A release is tagged android-<versionCode>, e.g. android-12 (see DEVELOPING.md). The number
// installed is read from the APK itself: an over-the-air update can't change it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { REPO_URL } from './links';

const LATEST_RELEASE = REPO_URL.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases/latest';
const CHECK_EVERY_MS = 86_400_000;
const STATE_KEY = 'sleepjournal.apkUpdate.v1';
const OFF_KEY = 'sleepjournal.apkUpdateOff.v1';

export interface ApkRelease { code: number; url: string }
interface State { checkedAt: number; release: ApkRelease | null; dismissed?: number }

/** "android-12" → 12. Other tags aren't APK releases. */
export function releaseCode(tag: unknown): number | null {
  const m = typeof tag === 'string' ? tag.match(/^android-(\d+)$/) : null;
  return m ? Number(m[1]) : null;
}

/** The installed APK's version code. null on iPhone, on the web and in Expo Go, so nothing runs there. */
export function installedCode(): number | null {
  if (Platform.OS !== 'android') return null;
  try {
    // Loaded only here: the module isn't in apps built before this feature.
    const Constants = require('expo-constants').default;
    if (Constants.executionEnvironment === 'storeClient') return null; // Expo Go
    const code = Number(require('expo-application').nativeBuildVersion);
    return Number.isInteger(code) && code > 0 ? code : null;
  } catch {
    return null;
  }
}

async function loadState(): Promise<State> {
  try {
    return { checkedAt: 0, release: null, ...JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? '{}') };
  } catch {
    return { checkedAt: 0, release: null };
  }
}
const saveState = (s: State) => AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)).catch(() => {});

export const loadApkChecksOff = async () => (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) === '1';
export const saveApkChecksOff = (off: boolean) => AsyncStorage.setItem(OFF_KEY, off ? '1' : '0');

/** The newer APK to offer, if any. Offline or a GitHub hiccup just means no notice today. */
async function findUpdate(installed: number): Promise<ApkRelease | null> {
  const state = await loadState();
  let { release } = state;
  if (Date.now() - state.checkedAt > CHECK_EVERY_MS) {
    try {
      const res = await fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
      if (res.ok) {
        const body = (await res.json()) as { tag_name?: string; html_url?: string };
        const code = releaseCode(body.tag_name);
        release = code !== null && body.html_url?.startsWith(`${REPO_URL}/`) ? { code, url: body.html_url } : null;
        await saveState({ ...state, checkedAt: Date.now(), release });
      }
    } catch {
      // try again next launch
    }
  }
  return release && release.code > installed && release.code !== state.dismissed ? release : null;
}

/** For the notice: the newer APK, and a way to hide the notice for that version. */
export function useApkUpdate() {
  const [release, setRelease] = useState<ApkRelease | null>(null);
  useEffect(() => {
    const installed = installedCode();
    if (installed === null) return;
    loadApkChecksOff().then((off) => (off ? null : findUpdate(installed))).then(setRelease, () => {});
  }, []);
  const dismiss = () => {
    if (release) loadState().then((s) => saveState({ ...s, dismissed: release.code }));
    setRelease(null);
  };
  return { release, dismiss };
}
