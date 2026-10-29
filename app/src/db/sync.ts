// Two-way sync with your own Google Sheet, through the Apps Script in google-sheets/.
//
//   push: nights changed on this phone since the last push → the sheet
//   pull: rows changed in the sheet since the last pull     → this phone
// Each side keeps an "updated" time per night and the newest version wins, so edits made in the
// sheet by hand (or from the web app) come back here. Deleting a night doesn't sync.
//
// The routine list (item names, order, hidden) syncs too, through the sheet's "Routine items" tab,
// so every device shows the same checklist and a rename stays one item.
//
// The connection code (script URL + secret key) is kept in the phone's secure storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadExcluded, loadRoutineDetail } from '@/lib/exportPrefs';
import { secureStorage } from '@/lib/secureStorage';
import { currentNight } from '@/lib/time';
import type { EntryPatch, RoutineItem, RoutinePhase } from '@/lib/types';
import { isEmptyRow, routineColumnsFor, rowToPatch, sheetPayload } from './csv';
import { getDb, store, writeEntry } from './store';
import { transaction } from './transaction';

const CONNECTION_KEY = 'sleepjournal.sheetConnection';
const STATE_KEY = 'sleepjournal.sheetSync.v1';
const PUSH_BATCH = 200;
/** The version of google-sheets/SleepJournalSync.gs this app was built for (its SCRIPT_VERSION). */
export const LATEST_SCRIPT_VERSION = 5;

export interface Connection { url: string; secret: string }

export interface SyncState {
  sheetName: string | null;
  /** The spreadsheet's address, for "Open sheet" (null until a version 4+ script reports it). */
  sheetUrl: string | null;
  lastPushed: string; // newest `updatedAt` already sent
  lastPulled: string; // newest sheet "Updated" already received
  lastSyncAt: string | null;
  lastError: string | null;
  /** The column layout last sent (names, hidden flags, legends). A change triggers a full refresh. */
  layout: string;
  /** The sheet script's version, as it last reported (scripts from before versions existed count as 1). */
  scriptVersion: number;
}
const EMPTY_STATE: SyncState = { sheetName: null, sheetUrl: null, lastPushed: '', lastPulled: '', lastSyncAt: null, lastError: null, layout: '', scriptVersion: LATEST_SCRIPT_VERSION };

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

/** Only ever open a real Google Sheets address, whatever the script answered. */
const sheetAddress = (url: unknown): string | null =>
  typeof url === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\/[\w\-/?=#&.%]*$/.test(url) ? url : null;

/** Save a connection after checking it works. Returns the spreadsheet's name. */
export async function connect(urlInput: string, keyInput = ''): Promise<string> {
  const code = tidyConnection(urlInput, keyInput);
  const conn = parseConnectionCode(code)!;
  const { sheet, url, version } = await call<{ sheet: string; url?: string; version?: number }>(conn, 'ping');
  await secureStorage.set(CONNECTION_KEY, code);
  await saveState({ ...EMPTY_STATE, sheetName: sheet, sheetUrl: sheetAddress(url), scriptVersion: version ?? 1 }); // a new sheet starts from scratch: push everything
  return sheet;
}

/**
 * After the 12/24-hour setting changed: writes every night to the sheet again in the new style.
 * It first takes in anything waiting in the sheet, then marks all nights as changed so they are
 * sent (the sheet keeps a row unless the app's copy is newer). Does nothing if no sheet is connected.
 */
export async function resendAllNights(): Promise<void> {
  if (!(await getConnection())) return;
  await syncNow().catch(() => {}); // offline: the nights are still marked and go out on the next sync
  // Later than anything already sent: a night merged in the last sync can be dated a second ahead.
  await (await getDb()).runAsync(`UPDATE entries SET updated_at = ?`, laterThan((await getSyncState()).lastPushed));
  requestSync(0);
}

/** Now, but at least a second after `time`, so the sheet sees this copy as the newer one. */
const laterThan = (time: string) =>
  new Date(Math.max(Date.now(), Date.parse(time) + 1000 || 0)).toISOString().slice(0, 19) + 'Z';

/** A night from the sheet, minus the fields this device changed and hasn't sent yet. */
function withoutFields(patch: EntryPatch, keep: Set<string>): EntryPatch {
  if (keep.size === 0) return patch;
  const out: EntryPatch = { ...patch };
  for (const k of keep) if (!k.startsWith('routine:')) delete out[k as keyof EntryPatch];
  if (out.routine) out.routine = Object.fromEntries(Object.entries(out.routine).filter(([id]) => !keep.has(`routine:${id}`)));
  return out;
}

/** Forget the sheet on this phone. Nothing is deleted on either side. */
export async function disconnect() {
  await secureStorage.remove(CONNECTION_KEY);
  await AsyncStorage.removeItem(STATE_KEY);
}

// ---------- the routine list ----------

/** A routine item as the sheet's "Routine items" tab keeps it. */
interface SheetRoutineItem {
  id: string; // RoutineItem.uid
  phase: RoutinePhase;
  label: string;
  kind: RoutineItem['kind'];
  order: number;
  hidden: boolean;
  updated: string;
}

const toSheetItem = (i: RoutineItem): SheetRoutineItem =>
  ({ id: i.uid, phase: i.phase, label: i.label, kind: i.kind, order: i.sortOrder, hidden: i.archived, updated: i.updatedAt });
const listKey = (items: SheetRoutineItem[]) =>
  JSON.stringify(items.map((i) => [i.id, i.phase, i.label, i.kind, i.order, i.hidden, i.updated]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

/**
 * Brings this device's routine list and the sheet's into line; per item, the newest edit wins.
 * It runs before the nights are exchanged, because nights name routine items by their label.
 *
 * The first time, the two sides don't know each other's ids, so items are paired up by name and
 * this device takes over the sheet's version of them (whichever device synced first set it).
 * Returns whether anything changed on this device.
 */
async function syncRoutine(conn: Connection): Promise<boolean> {
  let remote: SheetRoutineItem[];
  try {
    remote = (await call<{ items: SheetRoutineItem[] }>(conn, 'routine-get')).items;
  } catch (e) {
    if ((e as Error).message === 'Unknown action') return false; // the sheet's script is older than version 3
    throw e;
  }
  const local = await store.routine.list();
  const remoteIds = new Set(remote.map((r) => r.id));
  const paired = new Set<number>();
  let changed = false;
  const db = await getDb();
  // Hidden on another device: from the night of that edit (the sheet doesn't keep the night itself).
  const hiddenFrom = (r: SheetRoutineItem, mine?: RoutineItem) =>
    !r.hidden ? null : mine?.archived ? mine.hiddenSince : r.updated ? currentNight(new Date(r.updated)) : null;
  await transaction(db, async (tx) => {
    for (const r of remote) {
      let mine = local.find((l) => l.uid === r.id);
      const known = !!mine;
      mine ??= local.find((l) => !paired.has(l.id) && !remoteIds.has(l.uid) && l.phase === r.phase && l.label === r.label);
      if (!mine) {
        await tx.runAsync(
          `INSERT INTO routine_items (uid, label, phase, kind, sort_order, archived, updated_at, hidden_since) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id, r.label, r.phase, r.kind, r.order, Number(r.hidden), r.updated, hiddenFrom(r),
        );
        changed = true;
        continue;
      }
      paired.add(mine.id);
      if (listKey([toSheetItem(mine)]) === listKey([r])) continue;
      if (known && r.updated < mine.updatedAt) continue; // this device's edit is newer: it is sent below
      await tx.runAsync(
        `UPDATE routine_items SET uid = ?, label = ?, phase = ?, kind = ?, sort_order = ?, archived = ?, updated_at = ?, hidden_since = ? WHERE id = ?`,
        r.id, r.label, r.phase, r.kind, r.order, Number(r.hidden), r.updated, hiddenFrom(r, mine), mine.id,
      );
      changed = true;
    }
  });
  const mineNow = (await store.routine.list()).map(toSheetItem);
  if (listKey(mineNow) !== listKey(remote)) await call(conn, 'routine-set', { items: mineNow });
  return changed;
}

// ---------- nights ----------

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
  if (!running) {
    setStatus('syncing');
    running = runSync().then(
      (r) => { setStatus('done'); return r; },
      (e) => { setStatus('failed'); throw e; },
    ).finally(() => {
      running = null;
    });
  }
  return running;
}

/** What the sync is doing this session: 'idle' until the first one starts. */
export type SyncStatus = 'idle' | 'syncing' | 'done' | 'failed';
let status: SyncStatus = 'idle';
const statusListeners = new Set<() => void>();
function setStatus(next: SyncStatus) {
  status = next;
  statusListeners.forEach((fn) => fn());
}
export const getSyncStatus = () => status;
export function onSyncStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

async function runSync() {
  const conn = await getConnection();
  if (!conn) throw new Error('Not connected to a Google Sheet.');
  const state = await getSyncState();
  try {
    const routineChanged = await syncRoutine(conn);
    // The sheet shows the same fields you chose for exports; the rest are hidden there, not dropped.
    const options = { exclude: await loadExcluded(), routineDetail: await loadRoutineDetail() };

    // pull first, and merge field by field: a field changed here and not sent yet keeps this
    // device's value; every other field takes the sheet's. So two devices that each changed a
    // different field of the same night (the dream on one, the woke-up time on the other) both
    // keep their change, whichever saved last.
    const { tabs, version, sheet, url } = await call<{ tabs: PullTab[]; version?: number; sheet?: string; url?: string }>(conn, 'pull', { since: state.lastPulled });
    state.scriptVersion = version ?? 1;
    if (sheet) state.sheetName = sheet; // the sheet may have been renamed
    state.sheetUrl = sheetAddress(url) ?? state.sheetUrl;
    const local = new Map((await store.listEntries({ limit: 100_000 })).map((e) => [e.nightOf, e]));
    const unsynced = await store.unsyncedFields();
    const db = await getDb();
    let pulled = 0;
    const pulledNights = new Set<string>();
    for (const tab of tabs) {
      const routineCols = await routineColumnsFor(tab.header, tab.rows.map((r) => r.cells));
      await transaction(db, async (tx) => {
        for (const r of tab.rows) {
          const mine = local.get(r.nightOf);
          if (!mine && isEmptyRow(tab.header, r.cells)) continue;
          const theirsNewer = !mine || r.updated > mine.updatedAt;
          const keep = new Set((unsynced.get(r.nightOf) ?? '').split(' ').filter(Boolean));
          if (mine && keep.size === 0 && mine.updatedAt > state.lastPushed) {
            // Changed here before this app kept track of which fields: the newer copy wins whole.
            if (!theirsNewer) continue;
          }
          const patch = withoutFields(rowToPatch(tab.header, r.cells, r.nightOf, routineCols), keep);
          // Keep this night's own time when it's the newer copy, or when edits made here still have
          // to go out (so they win in the sheet); otherwise it now dates from the sheet's change.
          const at = mine && (!theirsNewer || keep.size) ? (theirsNewer ? laterThan(r.updated) : mine.updatedAt) : r.updated;
          await writeEntry(tx, r.nightOf, patch, at);
          if (theirsNewer) pulled++;
          pulledNights.add(r.nightOf);
        }
      });
      for (const r of tab.rows) if (r.updated > state.lastPulled) state.lastPulled = r.updated;
    }

    // push: nights changed here (now including what was just merged in). If the layout changed
    // (fields shown/hidden, routine items), send every night once so hidden columns and the
    // routine summaries are brought up to date. Nights that came from the sheet go back once too,
    // so the computed columns there (hours asleep, routine summaries) match; the sheet keeps its
    // own copy of a night unless this one is newer.
    // ("dates:ymd" was added when the sheet's dates became year-month-day: one full resend rewrote them.)
    const layout = JSON.stringify((await sheetPayload([], options)).columns) + '|dates:ymd';
    const full = layout !== state.layout;
    const sentWith = await store.unsyncedFields();
    const changed = (await store.listEntries({ limit: 100_000 }))
      .filter((e) => full || e.updatedAt > state.lastPushed || pulledNights.has(e.nightOf) || sentWith.has(e.nightOf))
      .sort((x, y) => x.nightOf.localeCompare(y.nightOf));
    let pushed = 0;
    for (let i = 0; i < changed.length; i += PUSH_BATCH) {
      const batch = changed.slice(i, i + PUSH_BATCH);
      const res = await call<{ written: number }>(conn, 'push', await sheetPayload(batch, options));
      pushed += res.written;
      for (const e of batch) if (sentWith.has(e.nightOf)) await store.markSynced(e.nightOf, e.updatedAt, sentWith.get(e.nightOf)!);
    }
    if (changed.length) state.lastPushed = changed.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), state.lastPushed);
    state.layout = layout;

    await saveState({ ...state, lastSyncAt: new Date().toISOString(), lastError: null });
    if (pulled || routineChanged) pulledListeners.forEach((fn) => fn());
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
