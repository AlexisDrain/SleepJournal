// All reads and writes go through here: plain SQL against the SQLite file on the phone.
import * as SQLite from 'expo-sqlite';
import { addDays, currentNight, weekdayOf } from '@/lib/time';
import type { Entry, EntryPatch, Nap, RoutineItem, Stats, Tag } from '@/lib/types';
import { migrate } from './migrations';
import { transaction } from './transaction';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (and on first use, creates + migrates) sleep-journal.db. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync('sleep-journal.db')
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((e) => {
      dbPromise = null; // let the next call retry
      throw e;
    });
  return dbPromise;
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`;

// ---------- entries ----------

const SELECT_ENTRY = `
  SELECT
    e.id,
    e.night_of          AS nightOf,
    e.in_bed_at         AS inBedAt,
    e.tried_sleep_at    AS triedSleepAt,
    e.sleep_latency_min AS sleepLatencyMin,
    e.woke_at           AS wokeAt,
    e.day_started_at    AS dayStartedAt,
    round((julianday(e.woke_at) - julianday(e.tried_sleep_at)) * 24
          - coalesce(e.sleep_latency_min, 0) / 60.0, 2) AS hoursAsleep,
    e.wake_count        AS wakeCount,
    e.rested,
    e.bedtime_note      AS bedtimeNote,
    e.morning_note      AS morningNote,
    e.dream,
    (SELECT json_group_array(name) FROM (
       SELECT t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id
       WHERE et.entry_id = e.id ORDER BY t.name))                           AS tags,
    (SELECT json_group_object(item_id, json(value))
     FROM entry_routine WHERE entry_id = e.id)                              AS routine,
    e.updated_at        AS updatedAt
  FROM entries e`;

type EntryRow = Omit<Entry, 'weekday' | 'tags' | 'routine'> & { tags: string; routine: string };

const toEntry = (r: EntryRow): Entry => ({
  ...r,
  weekday: weekdayOf(r.nightOf),
  tags: JSON.parse(r.tags),
  routine: JSON.parse(r.routine),
});

// API name → column, for the plain columns of `entries`.
const COLUMNS = {
  inBedAt: 'in_bed_at',
  triedSleepAt: 'tried_sleep_at',
  sleepLatencyMin: 'sleep_latency_min',
  wokeAt: 'woke_at',
  dayStartedAt: 'day_started_at',
  wakeCount: 'wake_count',
  rested: 'rested',
  bedtimeNote: 'bedtime_note',
  morningNote: 'morning_note',
  dream: 'dream',
} as const;

async function getEntry(nightOf: string): Promise<Entry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<EntryRow>(`${SELECT_ENTRY} WHERE e.night_of = ?`, nightOf);
  return row ? toEntry(row) : null;
}

async function listEntries({ from, to, limit = 60 }: { from?: string; to?: string; limit?: number } = {}) {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>(
    `${SELECT_ENTRY}
     WHERE ($from IS NULL OR e.night_of >= $from)
       AND ($to   IS NULL OR e.night_of <= $to)
     ORDER BY e.night_of DESC
     LIMIT $limit`,
    { $from: from ?? null, $to: to ?? null, $limit: limit },
  );
  return rows.map(toEntry);
}

/**
 * Write a night inside an open transaction. Creates the row if needed ("upsert").
 * `updatedAt` overrides the "last changed" time (sync uses the other side's time).
 */
export async function writeEntry(tx: SQLite.SQLiteDatabase, nightOf: string, patch: EntryPatch, updatedAt?: string): Promise<number> {
  const cols: string[] = [];
  const values: SQLite.SQLiteBindValue[] = [];
  for (const [key, col] of Object.entries(COLUMNS)) {
    const v = patch[key as keyof typeof COLUMNS];
    if (v !== undefined) {
      cols.push(col);
      values.push(v);
    }
  }
  if (updatedAt) {
    cols.push('updated_at');
    values.push(updatedAt);
  }
  const row = await tx.getFirstAsync<{ id: number }>(
    `INSERT INTO entries (night_of${cols.map((c) => `, ${c}`).join('')})
     VALUES (?${', ?'.repeat(cols.length)})
     ON CONFLICT (night_of) DO UPDATE SET
       ${[...cols.map((c) => `${c} = excluded.${c}`), ...(updatedAt ? [] : [`updated_at = ${NOW}`])].join(',\n       ')}
     RETURNING id`,
    [nightOf, ...values],
  );
  const id = row!.id;

  if (patch.tags) {
    // Replace the whole tag set. json_each turns a JSON array into rows.
    const names = JSON.stringify([...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]);
    await tx.runAsync(`INSERT OR IGNORE INTO tags (name) SELECT value FROM json_each(?)`, names);
    await tx.runAsync(`DELETE FROM entry_tags WHERE entry_id = ?`, id);
    await tx.runAsync(
      `INSERT INTO entry_tags (entry_id, tag_id)
       SELECT ?, id FROM tags WHERE name IN (SELECT value FROM json_each(?))`,
      id, names,
    );
  }
  if (patch.routine) {
    // Only the items sent are touched; null / false = not done.
    for (const [itemId, v] of Object.entries(patch.routine)) {
      await tx.runAsync(`DELETE FROM entry_routine WHERE entry_id = ? AND item_id = ?`, id, Number(itemId));
      if (v !== null && v !== false) {
        await tx.runAsync(
          `INSERT INTO entry_routine (entry_id, item_id, value) VALUES (?, ?, ?)`,
          id, Number(itemId), JSON.stringify(v),
        );
      }
    }
  }
  return id;
}

async function saveEntry(nightOf: string, patch: EntryPatch): Promise<Entry> {
  const db = await getDb();
  await transaction(db, (tx) => writeEntry(tx, nightOf, patch).then(() => {}));
  return (await getEntry(nightOf))!;
}

async function deleteEntry(nightOf: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM entries WHERE night_of = ?`, nightOf);
}

// ---------- simple tables: tags, routine items, naps ----------

/** CRUD for a small table. `columns` maps API names to columns; booleans are stored as 0/1. */
function table<T extends { id: number }>(name: string, orderBy: string, columns: Record<string, string>, bools: string[] = []) {
  const select = `SELECT id, ${Object.entries(columns).map(([api, col]) => `${col} AS ${api}`).join(', ')} FROM ${name}`;
  const fromRow = (r: Record<string, unknown>) => {
    for (const b of bools) r[b] = r[b] === 1;
    return r as T;
  };
  const pairs = (body: Partial<T>) =>
    Object.entries(columns)
      .filter(([api]) => body[api as keyof T] !== undefined)
      .map(([api, col]) => {
        const v = body[api as keyof T] as unknown;
        return [col, typeof v === 'boolean' ? Number(v) : v] as [string, SQLite.SQLiteBindValue];
      });

  return {
    list: async () => (await (await getDb()).getAllAsync<Record<string, unknown>>(`${select} ORDER BY ${orderBy}`)).map(fromRow),
    create: async (body: Omit<Partial<T>, 'id'>) => {
      const db = await getDb();
      const p = pairs(body as Partial<T>);
      const row = await db.getFirstAsync<Record<string, unknown>>(
        `INSERT INTO ${name} (${p.map(([c]) => c).join(', ')}) VALUES (${p.map(() => '?').join(', ')})
         RETURNING id, ${Object.entries(columns).map(([api, col]) => `${col} AS ${api}`).join(', ')}`,
        p.map(([, v]) => v),
      );
      return fromRow(row!);
    },
    update: async (id: number, body: Omit<Partial<T>, 'id'>) => {
      const db = await getDb();
      const p = pairs(body as Partial<T>);
      if (p.length) {
        await db.runAsync(`UPDATE ${name} SET ${p.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`, [...p.map(([, v]) => v), id]);
      }
    },
    remove: async (id: number) => {
      await (await getDb()).runAsync(`DELETE FROM ${name} WHERE id = ?`, id);
    },
  };
}

// ---------- stats ----------

/** Averages over the last N nights. Clock times are averaged as "minutes after noon" (bedtime)
 *  and "minutes after midnight" (morning), so 11 PM and 1 AM average to midnight, not noon. */
async function stats(days = 30): Promise<Stats> {
  const db = await getDb();
  const since = addDays(currentNight(), -days);
  const row = await db.getFirstAsync<Omit<Stats, 'days' | 'tagCounts'>>(
    `WITH n AS (
       SELECT e.*,
         (julianday(substr(tried_sleep_at, 1, 16)) - julianday(night_of || 'T12:00')) * 1440 AS tried_min,
         (julianday(substr(woke_at, 1, 16)) - julianday(date(night_of, '+1 day'))) * 1440 AS woke_min,
         (julianday(substr(day_started_at, 1, 16)) - julianday(date(night_of, '+1 day'))) * 1440 AS started_min,
         (julianday(woke_at) - julianday(tried_sleep_at)) * 24 - coalesce(sleep_latency_min, 0) / 60.0 AS hours
       FROM entries e
       WHERE night_of > ?
     )
     SELECT
       count(*)                          AS nights,
       CAST(round(avg(tried_min)) AS INTEGER)         AS avgTriedSleepMinAfterNoon,
       CAST(round(avg(sleep_latency_min)) AS INTEGER) AS avgLatencyMin,
       CAST(round(avg(woke_min)) AS INTEGER)          AS avgWokeMinAfterMidnight,
       CAST(round(avg(started_min)) AS INTEGER)       AS avgDayStartedMinAfterMidnight,
       round(avg(hours), 2)              AS avgHoursAsleep,
       round(avg(rested), 1)             AS avgRested
     FROM n`,
    since,
  );
  const tagCounts = await db.getAllAsync<{ name: string; count: number }>(
    `SELECT t.name, count(*) AS count
     FROM entry_tags et
     JOIN tags t    ON t.id = et.tag_id
     JOIN entries e ON e.id = et.entry_id
     WHERE e.night_of > ?
     GROUP BY t.name
     ORDER BY count DESC, t.name`,
    since,
  );
  return { days, ...row!, tagCounts };
}

export const store = {
  getEntry,
  listEntries,
  saveEntry,
  deleteEntry,
  tags: table<Tag>('tags', 'name', { name: 'name' }),
  routine: table<RoutineItem>(
    'routine_items',
    'phase, sort_order, id',
    { label: 'label', phase: 'phase', kind: 'kind', sortOrder: 'sort_order', archived: 'archived' },
    ['archived'],
  ),
  naps: table<Nap>('naps', 'start_at DESC', { startAt: 'start_at', endAt: 'end_at', note: 'note' }),
  stats,
};
