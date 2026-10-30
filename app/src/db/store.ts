// All reads and writes go through here: plain SQL against the SQLite file on the phone.
import * as SQLite from 'expo-sqlite';
import { getHoursMethod, type HoursMethod } from '@/lib/advanced';
import { currentNight, weekdayOf } from '@/lib/time';
import type { Entry, EntryPatch, Nap, RoutineItem, RoutinePhase, Tag } from '@/lib/types';
import { migrate } from './migrations';
import { transaction } from './transaction';
import { claimWebDatabase, explainStorageError } from './webStorage';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (and on first use, creates + migrates) sleep-journal.db. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= claimWebDatabase() // web: only one tab may hold the database
    .then(() => SQLite.openDatabaseAsync('sleep-journal.db'))
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((e) => {
      dbPromise = null; // let the next call retry
      throw explainStorageError(e);
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
    e.rested_skipped    AS restedSkipped,
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

type EntryRow = Omit<Entry, 'weekday' | 'tags' | 'routine' | 'restedSkipped'> & { tags: string; routine: string; restedSkipped: number };

type Times = Pick<Entry, 'inBedAt' | 'triedSleepAt' | 'sleepLatencyMin' | 'wokeAt' | 'dayStartedAt'>;

/** Hours asleep counted one of the ways in Settings → Advanced. */
export function hoursBy(method: HoursMethod, e: Times): number | null {
  const from = method.startsWith('bed') ? e.inBedAt : e.triedSleepAt;
  const to = method.endsWith('started') ? e.dayStartedAt : e.wokeAt;
  if (!from || !to) return null;
  return Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000 - (e.sleepLatencyMin ?? 0) / 60) * 100) / 100;
}

const toEntry = (r: EntryRow): Entry => ({
  ...r,
  hoursAsleep: getHoursMethod() === 'tried-woke' ? r.hoursAsleep : hoursBy(getHoursMethod(), r), // what this device shows
  restedSkipped: r.restedSkipped === 1,
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
  restedSkipped: 'rested_skipped',
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
      values.push(typeof v === 'boolean' ? Number(v) : v); // booleans are stored as 0/1
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
  if (!updatedAt) await markUnsynced(tx, id, fieldsOf(patch)); // an edit made here: it has to reach the sheet
  return id;
}

/** The field names a patch changes, as kept in `entries.unsynced`: "wokeAt", "tags", "routine:4"… */
export function fieldsOf(patch: EntryPatch): string[] {
  return [
    ...Object.keys(COLUMNS).filter((k) => patch[k as keyof typeof COLUMNS] !== undefined),
    ...(patch.tags ? ['tags'] : []),
    ...Object.keys(patch.routine ?? {}).map((id) => `routine:${id}`),
  ];
}

async function markUnsynced(tx: SQLite.SQLiteDatabase, id: number, fields: string[]) {
  if (!fields.length) return;
  const row = await tx.getFirstAsync<{ unsynced: string }>(`SELECT unsynced FROM entries WHERE id = ?`, id);
  const all = new Set([...(row?.unsynced.split(' ').filter(Boolean) ?? []), ...fields]);
  await tx.runAsync(`UPDATE entries SET unsynced = ? WHERE id = ?`, [...all].join(' '), id);
}

/** Per night: the fields changed here that the sheet doesn't have yet (as stored, space-separated). */
async function unsyncedFields(): Promise<Map<string, string>> {
  const rows = await (await getDb()).getAllAsync<{ nightOf: string; unsynced: string }>(
    `SELECT night_of AS nightOf, unsynced FROM entries WHERE unsynced <> ''`);
  return new Map(rows.map((r) => [r.nightOf, r.unsynced]));
}

/** The night reached the sheet as it was then. (Not if it was edited again meanwhile.) */
async function markSynced(nightOf: string, updatedAt: string, unsynced: string) {
  await (await getDb()).runAsync(
    `UPDATE entries SET unsynced = '' WHERE night_of = ? AND updated_at = ? AND unsynced = ?`, nightOf, updatedAt, unsynced);
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

// ---------- tags ----------

const tagTable = table<Tag>('tags', 'name', { name: 'name', archived: 'archived' }, ['archived']);

const tags = {
  list: tagTable.list,
  update: tagTable.update,

  /** Adds a tag. If a hidden tag already has this name, that one is shown again instead. */
  create: async ({ name }: { name: string }) => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO UPDATE SET archived = 0`, name.trim().toLowerCase());
  },

  /** Deletes a tag and takes it off every night. Those nights count as changed, so the sync carries it over. */
  remove: async (id: number) => {
    const db = await getDb();
    await transaction(db, async (tx) => {
      const nights = await tx.getAllAsync<{ entry_id: number }>(`SELECT entry_id FROM entry_tags WHERE tag_id = ?`, id);
      await tx.runAsync(`UPDATE entries SET updated_at = ${NOW} WHERE id IN (SELECT entry_id FROM entry_tags WHERE tag_id = ?)`, id);
      for (const n of nights) await markUnsynced(tx, n.entry_id, ['tags']);
      await tx.runAsync(`DELETE FROM tags WHERE id = ?`, id);
    });
  },
};

// ---------- routine items ----------

const routineTable = table<RoutineItem>(
  'routine_items',
  'phase, sort_order, id',
  { label: 'label', phase: 'phase', kind: 'kind', sortOrder: 'sort_order', archived: 'archived', uid: 'uid', updatedAt: 'updated_at', hiddenSince: 'hidden_since' },
  ['archived'],
);

const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';
const newUid = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const endOf = async (phase: RoutinePhase) =>
  (await (await getDb()).getFirstAsync<{ n: number }>(
    `SELECT coalesce(max(sort_order), 0) + 1 AS n FROM routine_items WHERE phase = ?`, phase))!.n;

type RoutineEdit = Partial<Pick<RoutineItem, 'label' | 'phase' | 'kind' | 'archived'>>;

/** Every change stamps the item, so the newest edit wins when devices sync through the sheet. */
const routine = {
  list: routineTable.list,
  remove: routineTable.remove,

  /** A new item goes to the end of its check-in's list. */
  create: async (body: Pick<RoutineItem, 'label' | 'phase' | 'kind'>) =>
    routineTable.create({ label: body.label, phase: body.phase, kind: body.kind, sortOrder: await endOf(body.phase), uid: newUid(), updatedAt: stamp() }),

  update: async (id: number, body: RoutineEdit) => {
    const db = await getDb();
    const now = await db.getFirstAsync<{ phase: RoutinePhase; archived: number }>(`SELECT phase, archived FROM routine_items WHERE id = ?`, id);
    // Moved to another list: it joins the end of that list.
    const moved = body.phase !== undefined && now !== null && body.phase !== now.phase;
    if (body.archived === false) await db.runAsync(`UPDATE routine_items SET hidden_since = NULL WHERE id = ?`, id);
    await routineTable.update(id, {
      label: body.label, phase: body.phase, kind: body.kind, archived: body.archived,
      ...(moved ? { sortOrder: await endOf(body.phase!) } : {}),
      // Hidden from tonight on; nights before keep it. (Showing it again clears this.)
      ...(body.archived === true && now?.archived !== 1 ? { hiddenSince: currentNight() } : {}),
      updatedAt: stamp(),
    });
  },

  /** Put a list's items in the given order (ids of the items showing); hidden ones keep their place after them. */
  setOrder: async (phase: RoutinePhase, ids: number[]) => {
    const db = await getDb();
    const all = (await routineTable.list()).filter((i) => i.phase === phase);
    const shown = ids.map((id) => all.find((i) => i.id === id)).filter((i): i is RoutineItem => !!i);
    const list = [...shown, ...all.filter((i) => !ids.includes(i.id))];
    const now = stamp();
    await transaction(db, async (tx) => {
      for (const [i, item] of list.entries()) {
        if (item.sortOrder !== i + 1) {
          await tx.runAsync(`UPDATE routine_items SET sort_order = ?, updated_at = ? WHERE id = ?`, i + 1, now, item.id);
        }
      }
    });
  },

  /** Move an item one place up (-1) or down (1) among the items that are showing. */
  move: async (id: number, direction: -1 | 1) => {
    const db = await getDb();
    const all = await routineTable.list();
    const me = all.find((i) => i.id === id);
    if (!me) return;
    const list = all.filter((i) => i.phase === me.phase);
    const from = list.indexOf(me);
    let to = from + direction;
    while (list[to]?.archived) to += direction; // hidden items don't count as a step
    if (!list[to]) return;
    list.splice(from, 1);
    list.splice(to, 0, me);
    const now = stamp();
    await transaction(db, async (tx) => {
      for (const [i, item] of list.entries()) {
        if (item.sortOrder !== i + 1) {
          await tx.runAsync(`UPDATE routine_items SET sort_order = ?, updated_at = ? WHERE id = ?`, i + 1, now, item.id);
        }
      }
    });
  },
};

/** The years that have at least one night, oldest first ("2025", "2026"…). */
async function years(): Promise<string[]> {
  const rows = await (await getDb()).getAllAsync<{ y: string }>(`SELECT DISTINCT substr(night_of, 1, 4) AS y FROM entries ORDER BY y`);
  return rows.map((r) => r.y);
}

export const store = {
  years,
  getEntry,
  listEntries,
  saveEntry,
  deleteEntry,
  unsyncedFields,
  markSynced,
  tags,
  routine,
  naps: table<Nap>('naps', 'start_at DESC', { startAt: 'start_at', endAt: 'end_at', note: 'note' }),
};
