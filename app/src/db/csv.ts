// Spreadsheet export/import.
//   CSV  — plain text, the backup format; Import reads it back.
//   XLSX — the same table with color-coded columns (green = general, blue = bedtime,
//          yellow = morning), for reading in Google Sheets / Excel.
// Columns are matched by header name on import, so their order doesn't matter.
// Times are written as the wall clock you saw ("11:30 PM") and put back on the right day on
// import using the night-of rule: bedtime PM → that evening, AM → after midnight; morning → next day.
import * as DocumentPicker from 'expo-document-picker';
import { addDays, toDateString, toLocalIso, weekdayOf } from '@/lib/time';
import type { Entry, EntryPatch, Phase, RoutineItem, RoutinePhase, RoutineValue } from '@/lib/types';
import { readPickedText, shareFile } from './files';
import { getDb, store, writeEntry } from './store';
import { buildXlsx, type ColumnGroup, type SheetColumn, type SheetValue } from './xlsx';
import { transaction } from './transaction';
import { clockFormatReady, formatTime } from '@/lib/clockFormat';

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
  col('Night of', 'other', 11, (e) => {
    const [y, m, d] = e.nightOf.split('-').map(Number);
    return `${m}-${d}-${y}`;
  }),
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
function parseDate(raw: string): string | null {
  const us = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (us) return toDateString(new Date(+us[3], +us[1] - 1, +us[2]));
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}

// ---------- export ----------

/** Always exported: every row needs its date, and import matches rows by it. */
export const REQUIRED_COLUMN = 'Night of';

/**
 * Every possible column, in export order. After each check-in's own fields come its routine:
 * first one compact summary column, then one detail column per item (hidden items too).
 */
async function allColumns(): Promise<Column[]> {
  await clockFormatReady; // times are written in the saved 12/24-hour style, never a guess
  const items = await store.routine.list();
  // The app never asks for "Times woke up" (it only comes from imported spreadsheets), so the column
  // only appears for journals that have such numbers. New journals don't get an always-empty column.
  const hasWakeCounts = !!(await (await getDb()).getFirstAsync('SELECT 1 AS x FROM entries WHERE wake_count IS NOT NULL LIMIT 1'));
  const base = BASE_COLUMNS.filter((c) => hasWakeCounts || c.header !== 'Times woke up');
  // "●●○● 3/4": a dot per current routine item in order, filled when done. Blank if none were done.
  const summary = (phase: RoutinePhase): Column => {
    const current = items.filter((i) => i.phase === phase && !i.archived).sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      ...col(SUMMARY_HEADER[phase], groupOf(phase), 26, (e) => {
        const done = current.map((i) => e.routine[i.id] != null && e.routine[i.id] !== false);
        const n = done.filter(Boolean).length;
        return n === 0 ? null : `${done.map((d) => (d ? '●' : '○')).join('')} ${n}/${current.length}`;
      }),
      derived: true,
      legend: current.map((i) => i.label).join(' · '),
    };
  };
  const routineCell = (item: RoutineItem, v: RoutineValue | undefined): SheetValue =>
    v === undefined || v === null ? null
    : item.kind === 'check' ? 'yes'
    : item.kind === 'time' ? clock(String(v))
    : typeof v === 'boolean' ? String(v) : v;
  const routineCols = (phase: RoutinePhase) =>
    items
      .filter((i) => i.phase === phase)
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
      derived: !!c.derived,
      hidden: !isIncluded(c, options),
      note: c.legend ? `● = done, ○ = not done, in this order: ${c.legend}` : '',
    })),
    rows: entries.map((e) => ({
      nightOf: e.nightOf,
      updated: e.updatedAt,
      values: Object.fromEntries(columns.map((c) => [c.header, c.value(e) ?? null])),
    })),
  };
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
  const [newestFirst, all] = await Promise.all([store.listEntries({ limit: 100_000 }), allColumns()]);
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
export async function routineColumnsFor(header: string[], body: string[][]): Promise<RoutineColumn[]> {
  const items = await store.routine.list();
  const cols: RoutineColumn[] = [];
  for (const [index, name] of header.entries()) {
    const phase = (Object.keys(PHASE_PREFIX) as RoutinePhase[]).find((p) => name.startsWith(PHASE_PREFIX[p]));
    if (!phase) continue;
    const label = name.slice(PHASE_PREFIX[phase].length);
    const values = body.map((r) => r[index] ?? '');
    const existing = items.find((i) => i.phase === phase && i.label === label);
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

export async function importCsvText(text: string): Promise<ImportResult> {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) throw new Error('The file is empty.');
  const header = rows[0].map((h) => h.trim());
  if (!header.includes('Night of')) throw new Error('This doesn\'t look like a Sleep Journal export (no "Night of" column).');
  const body = rows.slice(1);

  const db = await getDb();
  const existing = new Set(
    (await db.getAllAsync<{ night_of: string }>('SELECT night_of FROM entries')).map((r) => r.night_of),
  );
  const routineCols = await routineColumnsFor(header, body);

  const result: ImportResult = { imported: 0, skipped: 0, invalid: 0, empty: 0 };
  await transaction(db, async (tx) => {
    for (const r of body) {
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
  return result;
}

/** Lets the user pick a CSV (Files, iCloud Drive, Google Drive…) and imports it. null = cancelled. */
export async function pickAndImportCsv(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  return importCsvText(await readPickedText(picked.assets[0]));
}
