// Spreadsheet export/import.
//   CSV  — plain text, the backup format; Import reads it back.
//   XLSX — the same table with color-coded columns (green = general, blue = bedtime,
//          yellow = morning), for reading in Google Sheets / Excel.
// Columns are matched by header name on import, so their order doesn't matter.
// Times are written as the wall clock you saw ("11:30 PM") and put back on the right day on
// import using the night-of rule: bedtime PM → that evening, AM → after midnight; morning → next day.
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { addDays, toDateString, toLocalIso, weekdayOf } from '@/lib/time';
import type { Entry, EntryPatch, Phase, RoutineItem, RoutinePhase, RoutineValue } from '@/lib/types';
import { readPickedBytes, readPickedText, shareFile } from './files';
import { DELETED_ORDER, getDb, hoursBy, store, writeEntry } from './store';
import { buildXlsx, readXlsx, type ColumnGroup, type SheetColumn, type SheetValue } from './xlsx';
import { transaction } from './transaction';
import { advancedReady } from '@/lib/advanced';
import { clockFormatReady, formatTime } from '@/lib/clockFormat';
import { formatSheetDate, getDateStyle, localePrefsReady } from '@/lib/localePrefs';
import { mergeRoutine, type SheetRoutineItem } from './sync';

const PHASE_PREFIX: Record<RoutinePhase, string> = { bedtime: 'Bedtime: ', morning: 'Morning: ', anytime: 'Anytime: ' };
// "Anytime" items have no check-in of their own: they are colored like the general columns. They
// cover the calendar day of the row's date (midnight to midnight), so a time on one is on that date.
const groupOf = (phase: RoutinePhase): ColumnGroup => (phase === 'anytime' ? 'other' : phase);

interface Column extends SheetColumn {
  value: (e: Entry) => SheetValue;
  /** Holds numbers (the Google Sheet keeps these numeric; everything else is stored as text). */
  numeric?: boolean;
  /** One routine item's own column ("Bedtime: Brush teeth"). Hidden by default; the summary column stands in. */
  detail?: boolean;
  /** Worked out by the app from other fields, so it is never read back on import or sync. */
  derived?: boolean;
  /** For a routine summary column: which dot is which item, in order. */
  legend?: string;
}

/** The compact routine columns ("●●○● 3/4"), one per list. */
export const SUMMARY_HEADER: Record<RoutinePhase, string> = { bedtime: 'Bedtime routine', morning: 'Morning routine', anytime: 'Anytime routine' };
const DERIVED = new Set(['Day', 'Hours asleep']);
const NUMERIC = new Set(['Hours asleep', 'Minutes to fall asleep', 'Times woke up', 'Rested (1-5)']);
const col = (header: string, group: ColumnGroup, width: number, value: Column['value']): Column =>
  ({ header, group, width, value });

// Grouped by color: general, then bedtime, then morning.
const BASE_COLUMNS: Column[] = [
  col('Night of', 'other', 11, (e) => formatSheetDate(e.nightOf)), // in the style chosen in Settings → Advanced
  col('Day', 'other', 11, (e) => e.weekday),
  col('Hours asleep', 'other', 8, (e) => e.hoursAsleep),
  col('In bed', 'bedtime', 10, (e) => clock(e.inBedAt)),
  col('Tried to sleep', 'bedtime', 10, (e) => clock(e.triedSleepAt)),
  col('Bedtime note', 'bedtime', 30, (e) => e.bedtimeNote),
  col('Minutes to fall asleep', 'morning', 12, (e) => e.sleepLatencyMin),
  col('Times woke up', 'morning', 8, (e) => e.wakeCount),
  col('Woke up', 'morning', 10, (e) => clock(e.wokeAt)),
  col('Started day', 'morning', 10, (e) => clock(e.dayStartedAt)),
  col('Rested (1-5)', 'morning', 8, (e) => e.rested),
  col('Tags', 'morning', 20, (e) => e.tags.join(' + ')),
  col('Morning note', 'morning', 30, (e) => e.morningNote),
  col('Dream', 'morning', 30, (e) => e.dream),
];

// ---------- CSV text ----------

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (value += '"'), i++;
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(value), (value = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(value), rows.push(row), (row = []), (value = '');
    } else value += ch;
  }
  if (value || row.length) row.push(value), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- times ----------

/** "2026-09-26T23:30:00-07:00" → "11:30 PM", or "23:30" in 24-hour mode (the wall clock as recorded) */
function clock(iso: string | null): string {
  if (!iso) return '';
  // Not a time (a routine item changed to "time" that still holds a note or a number from before):
  // as it is, so it isn't garbled, and the sheet hands it back unchanged.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(iso)) return iso;
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return formatTime(h, m);
}

// Reading accepts both styles whatever the setting is, so old files and sheets always import.
const CLOCK = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;

/** "11:30 PM" or "23:30" on a night → local ISO timestamp on the right calendar day */
function fromClock(raw: string, nightOf: string, phase: RoutinePhase): string | null {
  const m = raw.trim().match(CLOCK);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  const hour = m[3] ? (+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0) : +m[1];
  const pm = hour >= 12;
  const day = phase !== 'anytime' && (phase === 'morning' || !pm) ? addDays(nightOf, 1) : nightOf;
  const [y, mo, d] = day.split('-').map(Number);
  return toLocalIso(new Date(y, mo - 1, d, hour, +m[2]));
}

/** "9-26-2026" (sheet style) or "2026-09-26" → "2026-09-26" */
/**
 * A date from a spreadsheet → "2026-10-23". Year-month-day is always understood. For the
 * two-digit styles, "23-10-2026" is read as day-month-year when that's the chosen style
 * (Settings → Advanced), otherwise as month-day-year (US, and what older exports used).
 */
function parseDate(raw: string): string | null {
  const n = raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (n) {
    const [a, b] = getDateStyle() === 'dmy' ? [+n[2], +n[1]] : [+n[1], +n[2]]; // [month, day]
    if (a < 1 || a > 12 || b < 1 || b > 31) return null;
    return toDateString(new Date(+n[3], a - 1, b));
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}

// ---------- export ----------

/** Always exported: every row needs its date, and import matches rows by it. */
export const REQUIRED_COLUMN = 'Night of';

/**
 * Two items of a list can have one name (one hidden, usually), but a sheet has one column per name.
 * The column belongs to the one you can see, both ways, or a tick on it would be lost in the sheet.
 */
const columnOwner = (items: RoutineItem[], phase: RoutinePhase, label: string) => {
  const same = items.filter((i) => i.phase === phase && i.label === label);
  return same.find((i) => !i.archived) ?? same.find((i) => i.sortOrder !== DELETED_ORDER) ?? same[0];
};

/**
 * Every possible column, in export order. After each check-in's own fields come its routine:
 * first one compact summary column, then one detail column per item (hidden items too).
 */
async function allColumns(): Promise<Column[]> {
  await Promise.all([clockFormatReady, localePrefsReady, advancedReady]); // saved time and date styles, never a guess
  const items = await store.routine.list();
  // The app never asks for "Times woke up" (it only comes from imported spreadsheets), so the column
  // only appears for journals that have such numbers. New journals don't get an always-empty column.
  const hasWakeCounts = !!(await (await getDb()).getFirstAsync('SELECT 1 AS x FROM entries WHERE wake_count IS NOT NULL LIMIT 1'));
  const base = BASE_COLUMNS.filter((c) => hasWakeCounts || c.header !== 'Times woke up');
  // "●●○● 3/4": a dot per routine item in order, filled when done. Blank if none were done.
  // A hidden item still has its dot on the nights before it was hidden, so old rows don't change.
  const summary = (phase: RoutinePhase): Column => {
    const list = items.filter((i) => i.phase === phase && (!i.archived || i.hiddenSince)).sort((a, b) => a.sortOrder - b.sortOrder);
    const counts = (i: RoutineItem, nightOf: string) => !i.archived || (!!i.hiddenSince && nightOf < i.hiddenSince);
    return {
      ...col(SUMMARY_HEADER[phase], groupOf(phase), 26, (e) => {
        const done = list.filter((i) => counts(i, e.nightOf)).map((i) => e.routine[i.id] != null && e.routine[i.id] !== false);
        const n = done.filter(Boolean).length;
        return n === 0 ? null : `${done.map((d) => (d ? '●' : '○')).join('')} ${n}/${done.length}`;
      }),
      derived: true,
      legend: list.map((i) => (i.archived ? `${i.label} (before ${i.hiddenSince})` : i.label)).join(' · '),
    };
  };
  const routineCell = (item: RoutineItem, v: RoutineValue | undefined): SheetValue =>
    v === undefined || v === null ? null
    : item.kind === 'check' ? 'yes'
    : item.kind === 'time' ? clock(String(v))
    : typeof v === 'boolean' ? String(v) : v;
  const routineCols = (phase: RoutinePhase) =>
    items
      .filter((i) => i.phase === phase && i === columnOwner(items, phase, i.label))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        ...col(PHASE_PREFIX[phase] + i.label, groupOf(phase), 14, (e) => routineCell(i, e.routine[i.id])),
        numeric: i.kind === 'number',
        detail: true,
      }));

  const lastBedtime = base.map((c) => c.group).lastIndexOf('bedtime');
  return [
    ...base.slice(0, lastBedtime + 1),
    summary('bedtime'),
    ...routineCols('bedtime'),
    ...base.slice(lastBedtime + 1),
    summary('morning'),
    ...routineCols('morning'),
    // The "anytime" list comes last, and only once it has items (so it adds nothing if you don't use it).
    ...(items.some((i) => i.phase === 'anytime') ? [summary('anytime'), ...routineCols('anytime')] : []),
  ].map((c) => ({ ...c, derived: c.derived ?? DERIVED.has(c.header) }));
}

/** Leaves out what the user switched off; the date column always stays. */
function isIncluded(c: Column, { exclude = new Set(), routineDetail = false }: ExportOptions): boolean {
  if (c.header === REQUIRED_COLUMN) return true;
  if (c.detail && !routineDetail) return false;
  return !exclude.has(c.header);
}

/**
 * Every column with each night's values, for the Google Sheet sync. Nothing is left out (the sheet
 * is how devices share data); columns the user switched off are sent as `hidden` instead.
 */
export async function sheetPayload(entries: Entry[], options: ExportOptions = {}) {
  const columns = (await allColumns()).map((c) => ({ ...c, numeric: c.numeric ?? NUMERIC.has(c.header) }));
  return {
    columns: columns.map((c) => ({
      header: c.header,
      group: c.group,
      numeric: c.numeric,
      derived: !!c.derived || c.header === REQUIRED_COLUMN,
      hidden: !isIncluded(c, options),
      note: c.legend ? `● = done, ○ = not done, in this order: ${c.legend}` : '',
    })),
    rows: entries.map((e) => ({
      nightOf: e.nightOf,
      updated: e.updatedAt,
      // The sheet always gets the same count of hours; each device's own choice is only for its display.
      values: Object.fromEntries(columns.map((c) => [c.header,
        c.header === REQUIRED_COLUMN ? e.nightOf : c.header === 'Hours asleep' ? hoursBy('tried-woke', e) : c.value(e) ?? null])),
    })),
  };
}

export const SHEET_CELL_WARNING = 9_000_000; // Google Sheets stops at 10 million cells

/** Google counts empty cells too, and a new tab starts with at least 1000 rows and 26 columns. */
export const sheetCells = (columns: number, years: number) => years * 1000 * Math.max(26, columns);

/** For a sheet script older than version 6: about how many cells the sheet has. High rather than low: older tabs can have fewer columns. */
export async function estimateSheetCells(): Promise<number> {
  const db = await getDb();
  const deleted = (await store.routine.listAll()).length - (await store.routine.list()).length; // their columns stay
  const years = await db.getFirstAsync<{ n: number }>(`SELECT count(DISTINCT substr(night_of, 1, 4)) AS n FROM entries`);
  return sheetCells((await allColumns()).length + deleted + 1, years?.n ?? 0); // + 1: "Updated"
}

/** Column names and colors, for the "choose fields" list (`detail` marks per-routine-item columns). */
export async function exportableColumns(): Promise<(SheetColumn & { detail: boolean })[]> {
  return (await allColumns()).map(({ header, group, width, detail }) => ({ header, group, width, detail: !!detail }));
}

/**
 * Every night as rows (oldest first). `exclude` lists column headers to leave out;
 * the date column is always kept.
 */
export interface ExportOptions {
  /** Column headers to leave out (the date column is always kept). */
  exclude?: ReadonlySet<string>;
  /** Add a blank row (date + day only) for every night between the first and last entry that has none. */
  fillGaps?: boolean;
  /** Only nights from this one on (YYYY-MM-DD). All nights when left out. */
  from?: string;
  /** Only nights up to this one (YYYY-MM-DD). */
  to?: string;
  /** Also include one column per routine item, next to the compact summary. Off by default. */
  routineDetail?: boolean;
  /** Keep summary headers short ("Bedtime routine") instead of adding the legend. For on-screen tables. */
  plainHeaders?: boolean;
}

/** A night with nothing recorded, for the blank rows of fillGaps. */
const emptyEntry = (nightOf: string): Entry => ({
  id: 0, nightOf, weekday: weekdayOf(nightOf), inBedAt: null, triedSleepAt: null, sleepLatencyMin: null,
  wokeAt: null, dayStartedAt: null, hoursAsleep: null, wakeCount: null, rested: null, restedSkipped: false,
  bedtimeNote: null, morningNote: null, dream: null, tags: [], routine: {}, updatedAt: '',
});

/** Every night as rows, oldest first. */
export async function buildTable(options: ExportOptions = {}): Promise<{ columns: Column[]; rows: SheetValue[][] }> {
  const { fillGaps = false } = options;
  const [newestFirst, all] = await Promise.all([store.listEntries({ from: options.from, to: options.to, limit: 100_000 }), allColumns()]);
  const columns = all
    .filter((c) => isIncluded(c, options))
    // In a file there's no hover note, so a summary column carries its legend in the header.
    .map((c) => (c.legend && !options.plainHeaders ? { ...c, header: `${c.header} (${c.legend})` } : c));
  let entries = [...newestFirst].reverse();
  if (fillGaps && entries.length > 1) {
    const byNight = new Map(entries.map((e) => [e.nightOf, e]));
    entries = [];
    for (let n = newestFirst.at(-1)!.nightOf; n <= newestFirst[0].nightOf; n = addDays(n, 1)) {
      entries.push(byNight.get(n) ?? emptyEntry(n));
    }
  }
  const rows = entries.map((e) => columns.map((c) => c.value(e)));
  return { columns, rows };
}

export async function buildCsv(options?: ExportOptions): Promise<string> {
  const { columns, rows } = await buildTable(options);
  return [columns.map((c) => c.header), ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * Plain CSV (backup / re-import) → share sheet (Files, Drive, email…).
 * A backup must be able to restore the routine, so the per-item columns are always included.
 */
export async function exportCsv(options?: ExportOptions): Promise<void> {
  await shareFile(`sleep-journal-${toDateString(new Date())}.csv`, await buildCsv({ ...options, routineDetail: true }),
    'text/csv', 'public.comma-separated-values-text');
}

/** The Stats tab's own export: the essentials only, for the nights it's showing. */
export const STATS_COLUMNS = ['Night of', 'Day', 'Hours asleep', 'Tried to sleep', 'Minutes to fall asleep', 'Started day', 'Tags', 'Bedtime note', 'Morning note'];

/** `include`: which of STATS_COLUMNS to export (the date and day are always there). */
export async function exportStats(format: 'csv' | 'xlsx', range: { from?: string; to?: string } = {}, include: readonly string[] = STATS_COLUMNS): Promise<void> {
  const all = await allColumns();
  const wanted = new Set(['Night of', 'Day', ...include]);
  const exclude = new Set(all.map((c) => c.header).filter((h) => !wanted.has(h)));
  const t = await buildTable({ exclude, ...range, plainHeaders: true });
  // "Morning note" only matters for nights from before it was taken out of the Journal.
  const at = t.columns.findIndex((c) => c.header === 'Morning note');
  const keep = t.columns.map((_, i) => i).filter((i) => i !== at || t.rows.some((r) => r[i]));
  const columns = keep.map((i) => t.columns[i]);
  const rows = t.rows.map((r) => keep.map((i) => r[i]));
  const name = `sleep-journal-stats-${toDateString(new Date())}`;
  if (format === 'csv') {
    const text = [columns.map((c) => c.header), ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    await shareFile(`${name}.csv`, text, 'text/csv', 'public.comma-separated-values-text');
  } else {
    await shareFile(`${name}.xlsx`, buildXlsx('Sleep stats', columns, rows),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet');
  }
}

/** Color-coded .xlsx for Google Sheets / Excel → share sheet. */
export async function exportXlsx(options?: ExportOptions): Promise<void> {
  const { columns, rows } = await buildTable(options);
  await shareFile(`sleep-journal-${toDateString(new Date())}.xlsx`, buildXlsx('Sleep journal', columns, rows),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet');
}

// ---------- import ----------

export interface ImportResult {
  imported: number;
  skipped: number; // nights already in the journal
  invalid: number; // rows without a usable date
  empty: number; // rows with a date but nothing recorded (blank rows from "include missing nights")
}

/** Guess what a routine column records from its values. */
function guessKind(values: string[]): RoutineItem['kind'] {
  const filled = values.filter((v) => v.trim() !== '');
  if (filled.every((v) => /^yes$/i.test(v))) return 'check';
  if (filled.every((v) => CLOCK.test(v.trim()))) return 'time';
  if (filled.every((v) => v.trim() !== '' && !Number.isNaN(Number(v)))) return 'number';
  return 'text';
}

// ---------- reading rows (shared by CSV import and Google Sheet sync) ----------

export interface RoutineColumn { index: number; item: RoutineItem }

/** Routine columns ("Bedtime: Brush teeth") → routine items, created if missing. Blank columns are ignored. */
/** A routine item as the sheet's own list has it (only what names a column). */
export interface SheetItemName { id: string; phase: RoutinePhase; label: string; order: number; hidden: boolean }

/**
 * The item that owns a column, going by the sheet's own list (which named the columns): an item
 * renamed here and not sent yet still has its old name in the sheet.
 */
function ownerInSheet(items: RoutineItem[], sheetItems: SheetItemName[], phase: RoutinePhase, label: string) {
  const named = sheetItems.flatMap((r) => {
    const mine = items.find((i) => i.uid === r.id);
    return mine ? [{ ...mine, phase: r.phase, label: r.label, archived: r.hidden, sortOrder: r.order }] : [];
  });
  const owner = columnOwner(named, phase, label);
  return owner && items.find((i) => i.id === owner.id);
}

export async function routineColumnsFor(header: string[], body: string[][], sheetItems?: SheetItemName[]): Promise<RoutineColumn[]> {
  const items = await store.routine.listAll();
  const cols: RoutineColumn[] = [];
  for (const [index, name] of header.entries()) {
    const phase = (Object.keys(PHASE_PREFIX) as RoutinePhase[]).find((p) => name.startsWith(PHASE_PREFIX[p]));
    if (!phase) continue;
    const label = name.slice(PHASE_PREFIX[phase].length);
    const values = body.map((r) => r[index] ?? '');
    const existing = (sheetItems && ownerInSheet(items, sheetItems, phase, label)) || columnOwner(items, phase, label);
    if (existing?.sortOrder === DELETED_ORDER) continue; // its old column stays in the sheet, unread
    if (existing) cols.push({ index, item: existing });
    else if (values.some((v) => v.trim() !== '')) {
      cols.push({ index, item: await store.routine.create({ label, phase, kind: guessKind(values) }) });
    }
  }
  return cols;
}

// Columns that are just labels or computed: a row with nothing else is an empty night.
const META = new Set(['Night of', 'Day', 'Hours asleep', 'Updated']);
const isMeta = (h: string) => META.has(h) || Object.values(SUMMARY_HEADER).some((s) => h === s || h.startsWith(s + ' ('));

/** The night a row belongs to, or null if it has no usable date. */
export function nightOfRow(header: string[], row: string[]): string | null {
  return parseDate((row[header.indexOf('Night of')] ?? '').trim());
}

/** True when a row has a date but nothing recorded. */
export function isEmptyRow(header: string[], row: string[]): boolean {
  return header.every((h, i) => isMeta(h) || !(row[i] ?? '').trim());
}

/**
 * A row of text cells → a full patch for that night. Every field is set (blank → cleared),
 * including all routine columns, so applying it makes the night match the row exactly.
 */
/**
 * One spreadsheet row → changes for that night. Careful with what people do to sheets:
 *   - a column that isn't there (deleted, renamed) leaves that field alone (undefined)
 *   - a cell that can't be read (text in a time or number column) also leaves it alone
 *   - only an empty cell clears the field (null)
 * So a damaged sheet can never wipe what's on the device.
 */
export function rowToPatch(header: string[], row: string[], nightOf: string, routineCols: RoutineColumn[]): EntryPatch {
  const cellOf = (name: string): string | undefined => (header.indexOf(name) >= 0 ? (row[header.indexOf(name)] ?? '').trim() : undefined);
  const text = (name: string) => { const v = cellOf(name); return v === undefined ? undefined : v || null; };
  const time = (name: string, phase: RoutinePhase) => {
    const v = cellOf(name);
    if (v === undefined) return undefined;
    if (!v) return null;
    return fromClock(v, nightOf, phase) ?? undefined; // unreadable: keep what's there
  };
  const int = (name: string, ok: (n: number) => boolean = () => true) => {
    const v = cellOf(name);
    if (v === undefined) return undefined;
    if (!v) return null;
    return /^\d+$/.test(v) && ok(Number(v)) ? Number(v) : undefined;
  };

  const routine: Record<string, RoutineValue> = {};
  for (const { index, item } of routineCols) {
    const v = (row[index] ?? '').trim();
    const value: RoutineValue | undefined =
      !v ? null
      : item.kind === 'check' ? true
      : item.kind === 'time' ? fromClock(v, nightOf, item.phase) ?? undefined
      : item.kind === 'number' ? (Number.isNaN(Number(v)) ? undefined : Number(v))
      : v;
    if (value !== undefined) routine[item.id] = value;
  }
  const tags = cellOf('Tags');

  return {
    inBedAt: time('In bed', 'bedtime'),
    triedSleepAt: time('Tried to sleep', 'bedtime'),
    sleepLatencyMin: int('Minutes to fall asleep'),
    wakeCount: int('Times woke up'),
    wokeAt: time('Woke up', 'morning'),
    dayStartedAt: time('Started day', 'morning'),
    rested: int('Rested (1-5)', (n) => n >= 1 && n <= 5),
    bedtimeNote: text('Bedtime note'),
    morningNote: text('Morning note'),
    dream: text('Dream'),
    tags: tags === undefined ? undefined : tags.split('+').map((t) => t.trim()).filter(Boolean),
    routine,
  };
}

/** The Google Sheet's "Routine items" tab (Id, Check-in, Item, Records, Order, Hidden, Updated). */
const isRoutineTab = (header?: string[]) => !!header && ['Check-in', 'Item', 'Order'].every((h) => header.some((x) => x.trim() === h));

/** That tab's rows, as the sync reads them from the sheet's script (routineItem_ in the .gs). */
export function routineItemsFrom(rows: string[][]): SheetRoutineItem[] {
  const header = rows[0].map((h) => h.trim());
  const at = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();
  const kinds: RoutineItem['kind'][] = ['check', 'time', 'number', 'text'];
  return rows.slice(1).flatMap((r) => {
    const phase = at(r, 'Check-in').toLowerCase() as RoutinePhase;
    const label = at(r, 'Item');
    if (!label || !(phase in PHASE_PREFIX)) return [];
    const kind = at(r, 'Records').toLowerCase() as RoutineItem['kind'];
    return [{
      // A row typed in by hand has no id yet: give it one, as the sheet's script would.
      id: at(r, 'Id') || Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      phase, label,
      kind: kinds.includes(kind) ? kind : 'check',
      order: Number(at(r, 'Order')) || 0,
      hidden: /^(yes|true)$/i.test(at(r, 'Hidden')),
      updated: at(r, 'Updated'),
    }];
  });
}

/** Called as an import goes: rows looked at so far, out of all of them. (0, 0) = still reading the file. */
export type ImportProgress = (done: number, total: number) => void;

/**
 * Nights saved per transaction. Phones lock the database for a transaction, and each night is several
 * calls to it: one transaction for a whole year of nights kept the other tabs waiting (they read the
 * database) and showed nothing until the end. In small batches, the tabs and the screen keep going
 * between them, the import can say how far it got, and if the app is closed partway, the nights
 * already saved stay (importing again skips them and carries on).
 */
const IMPORT_BATCH = 25;

export async function importCsvText(text: string, onProgress?: ImportProgress): Promise<ImportResult> {
  return importSheets([parseCsv(text.replace(/^﻿/, ''))], onProgress);
}

export async function importXlsx(bytes: Uint8Array, onProgress?: ImportProgress): Promise<ImportResult> {
  const all = readXlsx(bytes);
  const sheets = all.filter((s) => s.rows[0]?.some((h) => h.trim() === REQUIRED_COLUMN));
  // A Google Sheet keeps the routine list, in order, in its "Routine items" tab: bring that in first,
  // as connecting the sheet would, so the items keep its order (and kinds, and hidden ones), and the
  // nights' columns land on them.
  const routineTab = all.find((s) => isRoutineTab(s.rows[0]));
  if (sheets.length && routineTab) await mergeRoutine(routineItemsFrom(routineTab.rows));
  // None with a "Night of" column: the first one, to explain what's missing.
  return importSheets(sheets.length ? sheets.map((s) => s.rows) : [all[0]?.rows ?? []], onProgress);
}

async function importSheets(sheets: string[][][], onProgress?: ImportProgress): Promise<ImportResult> {
  // Every sheet checked before anything is written: a wrong file changes nothing.
  const plans = sheets.map((rows) => {
    if (rows.length === 0) throw new Error('The file is empty.');
    const header = rows[0].map((h) => h.trim());
    if (!header.includes('Night of')) throw new Error(`This doesn't look like a 1-Minute Sleep Journal export (no "Night of" column).`);
    return { header, body: rows.slice(1) };
  });
  const total = plans.reduce((n, p) => n + p.body.length, 0);

  const db = await getDb();
  const existing = new Set(
    (await db.getAllAsync<{ night_of: string }>('SELECT night_of FROM entries')).map((r) => r.night_of),
  );
  const result: ImportResult = { imported: 0, skipped: 0, invalid: 0, empty: 0 };
  let done = 0;
  onProgress?.(0, total);
  for (const { header, body } of plans) {
    const routineCols = await routineColumnsFor(header, body);
    for (let i = 0; i < body.length; i += IMPORT_BATCH) {
      const batch = body.slice(i, i + IMPORT_BATCH);
      await transaction(db, async (tx) => {
        for (const r of batch) {
          const nightOf = nightOfRow(header, r);
          if (!nightOf) {
            result.invalid++;
            continue;
          }
          if (isEmptyRow(header, r)) {
            result.empty++;
            continue;
          }
          if (existing.has(nightOf)) {
            result.skipped++;
            continue;
          }
          await writeEntry(tx, nightOf, rowToPatch(header, r, nightOf, routineCols));
          existing.add(nightOf);
          result.imported++;
        }
      });
      done += batch.length;
      onProgress?.(done, total);
      await new Promise((resolve) => setTimeout(resolve, 0)); // the screen draws, other tabs read
    }
  }
  return result;
}

/** How to make a real spreadsheet file from a Google Sheet, on this device. */
const SAVE_AS_EXCEL = Platform.OS === 'ios'
  ? 'save a copy as an Excel file (in the Google Sheets app: ⋯ → Share & export → Send a copy → Excel, then Save to Files)'
  : 'save a copy as an Excel file (in the Google Sheets app: ⋮ → Share & export → Save as → Excel (.xlsx))';

/**
 * A Google Sheet picked in Drive isn't a file: it's a Google document with nothing to read until it's
 * converted, which the picker doesn't do. Say how to bring it in instead.
 */
export const GOOGLE_FILE_MESSAGE =
  "That's a Google Sheet, which isn't a file the app can open. Two ways to bring it in: connect it in " +
  `Settings → Google Sheet (all its nights come in, and stay in sync), or ${SAVE_AS_EXCEL} and import that file.`;

/**
 * Google's own documents (Sheets, Docs…): by their type (Android), or by the shortcut file Google Drive
 * gives elsewhere, which only links to the document online (Sleep Journal.gsheet).
 */
export const isGoogleFile = (mimeType?: string | null, name?: string | null) =>
  (!!mimeType && mimeType.startsWith('application/vnd.google-apps')) || /\.g(sheet|doc|slides|form|draw|site)$/i.test(name ?? '');

export async function pickAndImport(onProgress?: ImportProgress): Promise<ImportResult | null> {
  const file = await pickFile();
  if (!file) return null;
  if (isGoogleFile(file.mimeType, file.name)) throw new Error(GOOGLE_FILE_MESSAGE);
  // Reading a big file takes a while on a phone, before any night is saved: say so first, and let
  // the screen draw that before the work starts.
  onProgress?.(0, 0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  // By what the file is, not its name or type: a download can be named or typed wrongly.
  const bytes = await readPickedBytes(file);
  const kind = fileKind(bytes);
  if (kind === 'xlsx') return importXlsx(bytes, onProgress);
  if (kind === 'pdf') throw new Error(PDF_MESSAGE);
  return importCsvText(await readPickedText(file), onProgress);
}

/** An .xlsx is a zip ("PK"), a PDF starts "%PDF"; anything else is read as CSV text. */
export function fileKind(bytes: Uint8Array): 'xlsx' | 'pdf' | 'text' {
  const starts = (s: string) => s.split('').every((c, i) => bytes[i] === c.charCodeAt(0));
  return starts('PK') ? 'xlsx' : starts('%PDF') ? 'pdf' : 'text';
}

export const PDF_MESSAGE =
  "That's a PDF, which shows a sheet but doesn't hold its data. Import a .csv or .xlsx instead: for a Google " +
  `Sheet, connect it in Settings → Google Sheet, or ${Platform.OS === 'android'
    ? 'in the Google Sheets app tap ⋮ → Share & export → Save as → Excel (.xlsx)'
    : 'save a copy as an Excel file'} and import that.`;

/** The file to import, or null if cancelled. */
async function pickFile(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  } catch (e) {
    // Android can't copy a Google document (it has no file to copy): the picker fails here.
    throw new Error(`${(e as Error).message}

If you picked a Google Sheet: ${GOOGLE_FILE_MESSAGE}`);
  }
  return picked.canceled ? null : picked.assets[0];
}
