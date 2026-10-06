// Two-way sync with your own Google Sheet, through the Apps Script in google-sheets/.
//
//   push: nights changed on this phone since the last push → the sheet
//   pull: rows changed in the sheet since the last pull     → this phone
// Each side keeps an "updated" time per night and the newest version wins, so edits made in the
// sheet by hand (or from the web app) come back here. Deleting a night doesn't sync.
//
// The connection code (script URL + secret key) is kept in the phone's secure storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadExcluded, loadRoutineDetail } from '@/lib/exportPrefs';
import { secureStorage } from '@/lib/secureStorage';
import { isEmptyRow, routineColumnsFor, rowToPatch, sheetPayload } from './csv';
import { getDb, store, writeEntry } from './store';
import { transaction } from './transaction';

const CONNECTION_KEY = 'sleepjournal.sheetConnection';
const STATE_KEY = 'sleepjournal.sheetSync.v1';
const PUSH_BATCH = 200;
/** The version of google-sheets/SleepJournalSync.gs this app was built for (its SCRIPT_VERSION). */
export const LATEST_SCRIPT_VERSION = 2;

export interface Connection { url: string; secret: string }

export interface SyncState {
  sheetName: string | null;
  lastPushed: string; // newest `updatedAt` already sent
  lastPulled: string; // newest sheet "Updated" already received
  lastSyncAt: string | null;
  lastError: string | null;
  /** The column layout last sent (names, hidden flags, legends). A change triggers a full refresh. */
  layout: string;
  /** The sheet script's version, as it last reported (scripts from before versions existed count as 1). */
  scriptVersion: number;
}
const EMPTY_STATE: SyncState = { sheetName: null, lastPushed: '', lastPulled: '', lastSyncAt: null, lastError: null, layout: '', scriptVersion: LATEST_SCRIPT_VERSION };

/** "https://script.google.com/macros/s/…/exec#<secret>" → its parts, or null if it isn't one. */
export function parseConnectionCode(code: string): Connection | null {
  const m = code.trim().match(/^(https:\/\/script\.google\.com\/(?:a\/[^/\s]+\/)?macros\/s\/[\w-]+\/exec)#([A-Za-z0-9]{32,})$/);
  return m ? { url: m[1], secret: m[2] } : null;
}

export async function getConnection(): Promise<Connection | null> {
  const code = await secureStorage.get(CONNECTION_KEY);
  return code ? parseConnectionCode(code) : null;
}

export async function getSyncState(): Promise<SyncState> {
  try {
    return { ...EMPTY_STATE, ...JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? '{}') };
  } catch {
    return EMPTY_STATE;
  }
}

async function saveState(s: SyncState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));
}

async function call<T>(conn: Connection, action: string, body: object = {}): Promise<T> {
  let res: Response;
  try {
    // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script requires on the web.
    res = await fetch(conn.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: conn.secret, action, ...body }),
    });
  } catch {
    throw new Error("Can't reach Google. Check your internet connection.");
  }
  const text = await res.text();
  let data: { ok: boolean; error?: string } & T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Google answered with a web page instead of data. Check the script is deployed as a web app with "Who has access: Anyone".',
    );
  }
  if (!data.ok) throw new Error(data.error ?? 'The sheet refused the request.');
  return data;
}

/**
 * Tidies what was typed or pasted into the two boxes and joins it into a connection code.
 * Forgives the usual slips: spaces and line breaks from copying, a missing "https://", "http://",
 * a "?…" tail on the address, a leading "#" on the key, or the whole "address#key" pasted into
 * the address box. Throws a message saying exactly what's wrong otherwise.
 */
export function tidyConnection(urlInput: string, keyInput: string): string {
  let url = urlInput.replace(/\s+/g, '');
  let key = keyInput.replace(/\s+/g, '').replace(/^#/, '');
  const hash = url.indexOf('#');
  if (hash >= 0) {
    if (!key) key = url.slice(hash + 1);
    url = url.slice(0, hash);
  }
  url = url.replace(/^http:\/\//i, 'https://').replace(/\?.*$/, '').replace(/\/+$/, '');
  if (url && !/^https:\/\//i.test(url)) url = `https://${url}`;

  if (!url) throw new Error('Paste the Web app URL from Deploy → Manage deployments.');
  if (/\/dev$/.test(url)) {
    throw new Error("That address ends in /dev, which is Google's test address. Use the Web app URL from Deploy → Manage deployments: it ends in /exec.");
  }
  if (!/^https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/.test(url)) {
    throw new Error("That doesn't look like a Web app URL. It should look like https://script.google.com/macros/s/…/exec");
  }
  if (!key) throw new Error('Paste the secret key that showConnectionCode printed.');
  if (!/^[A-Za-z0-9]{32,}$/.test(key)) {
    throw new Error("That doesn't look like the secret key. It's the long run of letters and numbers that showConnectionCode printed.");
  }
  return `${url}#${key}`;
}

/** Save a connection after checking it works. Returns the spreadsheet's name. */
export async function connect(urlInput: string, keyInput = ''): Promise<string> {
  const code = tidyConnection(urlInput, keyInput);
  const conn = parseConnectionCode(code)!;
  const { sheet, version } = await call<{ sheet: string; version?: number }>(conn, 'ping');
  await secureStorage.set(CONNECTION_KEY, code);
  await saveState({ ...EMPTY_STATE, sheetName: sheet, scriptVersion: version ?? 1 }); // a new sheet starts from scratch: push everything
  return sheet;
}

/** Forget the sheet on this phone. Nothing is deleted on either side. */
export async function disconnect() {
  await secureStorage.remove(CONNECTION_KEY);
  await AsyncStorage.removeItem(STATE_KEY);
}

interface PullTab { header: string[]; rows: { nightOf: string; updated: string; cells: string[] }[] }

const pulledListeners = new Set<() => void>();
/** Get told when a sync brought in changes from the sheet (to refresh what's on screen). */
export function onPulled(fn: () => void): () => void {
  pulledListeners.add(fn);
  return () => pulledListeners.delete(fn);
}

let running: Promise<{ pushed: number; pulled: number }> | null = null;

/** Push then pull. Concurrent calls share one run. */
export function syncNow(): Promise<{ pushed: number; pulled: number }> {
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

async function runSync() {
  const conn = await getConnection();
  if (!conn) throw new Error('Not connected to a Google Sheet.');
  const state = await getSyncState();
  try {
    const entries = await store.listEntries({ limit: 100_000 });
    // The sheet shows the same fields you chose for exports; the rest are hidden there, not dropped.
    const options = { exclude: await loadExcluded(), routineDetail: await loadRoutineDetail() };
    const push = async (nights: typeof entries) => {
      let written = 0;
      for (let i = 0; i < nights.length; i += PUSH_BATCH) {
        const res = await call<{ written: number }>(conn, 'push', await sheetPayload(nights.slice(i, i + PUSH_BATCH), options));
        written += res.written;
      }
      return written;
    };

    // push: nights changed here. If the layout changed (fields shown/hidden, routine items), send
    // every night once so hidden columns and the routine summaries are brought up to date.
    const layout = JSON.stringify((await sheetPayload([], options)).columns);
    const full = layout !== state.layout;
    const changed = entries
      .filter((e) => full || e.updatedAt > state.lastPushed)
      .sort((a, b) => a.nightOf.localeCompare(b.nightOf));
    const pushed = await push(changed);
    if (changed.length) state.lastPushed = changed.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), state.lastPushed);
    state.layout = layout;

    // pull
    const { tabs, version } = await call<{ tabs: PullTab[]; version?: number }>(conn, 'pull', { since: state.lastPulled });
    state.scriptVersion = version ?? 1;
    const local = new Map(entries.map((e) => [e.nightOf, e]));
    const db = await getDb();
    let pulled = 0;
    const pulledNights = new Set<string>();
    for (const tab of tabs) {
      const routineCols = await routineColumnsFor(tab.header, tab.rows.map((r) => r.cells));
      await transaction(db, async (tx) => {
        for (const r of tab.rows) {
          const mine = local.get(r.nightOf);
          if (mine && mine.updatedAt >= r.updated) continue; // this phone's version is as new or newer
          if (!mine && isEmptyRow(tab.header, r.cells)) continue;
          await writeEntry(tx, r.nightOf, rowToPatch(tab.header, r.cells, r.nightOf, routineCols), r.updated);
          pulled++;
          pulledNights.add(r.nightOf);
        }
      });
      for (const r of tab.rows) if (r.updated > state.lastPulled) state.lastPulled = r.updated;
    }

    // Nights that came from the sheet: send them back once so the computed columns there
  // (hours asleep, routine summaries) match what was just typed. Their data isn't overwritten.
    if (pulledNights.size) {
      await push((await store.listEntries({ limit: 100_000 })).filter((e) => pulledNights.has(e.nightOf)));
    }

    await saveState({ ...state, lastSyncAt: new Date().toISOString(), lastError: null });
    if (pulled) pulledListeners.forEach((fn) => fn());
    return { pushed, pulled };
  } catch (e) {
    await saveState({ ...state, lastError: (e as Error).message });
    throw e;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Sync a few seconds from now if a sheet is connected (after saves, on launch/resume). Errors are kept in the state. */
export function requestSync(delayMs = 3000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (await getConnection()) syncNow().catch(() => {});
  }, delayMs);
}
