// Schema migrations for the on-device SQLite database.
//
// Each string runs once, in order. SQLite's built-in `PRAGMA user_version` remembers how
// many have been applied (0 on a fresh install). Once the app is released, never edit a
// migration that has shipped: add a new one to the end instead.
//
// Timestamps are TEXT in local ISO-8601 with the UTC offset, e.g. "2026-09-26T23:30:00-07:00":
//   substr(x, 1, 16)  → the wall-clock time you saw ("2026-09-26T23:30"), for averages
//   julianday(x)      → the real instant (offset applied), for durations
import type { SQLiteDatabase } from 'expo-sqlite';
import { transaction } from './transaction';

export const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  -- One row per night. night_of is the date the night STARTS on:
  -- the night of 2026-09-26 is the one you wake up from on 2026-09-27.
  CREATE TABLE entries (
    id                INTEGER PRIMARY KEY,
    night_of          TEXT NOT NULL UNIQUE CHECK (date(night_of) = night_of),

    -- bedtime
    in_bed_at         TEXT,
    tried_sleep_at    TEXT,
    bedtime_note      TEXT,

    -- morning
    sleep_latency_min INTEGER CHECK (sleep_latency_min BETWEEN 0 AND 1440),
    woke_at           TEXT,
    day_started_at    TEXT,
    wake_count        INTEGER CHECK (wake_count >= 0),
    rested            INTEGER CHECK (rested BETWEEN 1 AND 5), -- 1 exhausted … 5 well rested
    morning_note      TEXT,
    dream             TEXT,

    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  ) STRICT;

  -- Quick one-tap labels: insomnia, caffeine, good dream...
  CREATE TABLE tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (name = lower(trim(name)) AND name <> '')
  ) STRICT;

  CREATE TABLE entry_tags (
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
  ) STRICT;

  -- The bedtime / morning routine. Every item is a checkbox; kind says what else it records:
  --   check  "Brush teeth"        value: true
  --   time   "Phone off"          value: "2026-09-26T22:30:00-07:00"
  --   number "Cups of coffee"     value: 2
  --   text   "What I read"        value: "Dune"
  -- No row in entry_routine = not done.
  CREATE TABLE routine_items (
    id         INTEGER PRIMARY KEY,
    label      TEXT NOT NULL,
    phase      TEXT NOT NULL CHECK (phase IN ('bedtime', 'morning')),
    kind       TEXT NOT NULL DEFAULT 'check' CHECK (kind IN ('check', 'time', 'number', 'text')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)) -- hidden, history kept
  ) STRICT;

  CREATE TABLE entry_routine (
    entry_id INTEGER NOT NULL REFERENCES entries(id)       ON DELETE CASCADE,
    item_id  INTEGER NOT NULL REFERENCES routine_items(id) ON DELETE CASCADE,
    value    TEXT    NOT NULL CHECK (json_valid(value)),   -- JSON: true | "…" | 2
    PRIMARY KEY (entry_id, item_id)
  ) STRICT;

  CREATE TABLE naps (
    id       INTEGER PRIMARY KEY,
    start_at TEXT NOT NULL,
    end_at   TEXT CHECK (end_at IS NULL OR julianday(end_at) > julianday(start_at)),
    note     TEXT
  ) STRICT;
  CREATE INDEX naps_start_at_idx ON naps (start_at);

  -- Starter suggestions. Everything can be renamed, hidden or deleted in the app.
  INSERT INTO tags (name) VALUES
    ('insomnia'), ('woke up at night'), ('caffeine'), ('late screens'), ('exercise'),
    ('stress'), ('travel'), ('good dream'), ('bad dream');

  INSERT INTO routine_items (label, phase, kind, sort_order) VALUES
    ('Brush teeth',                      'bedtime', 'check', 1),
    ('Take meds / vitamins',             'bedtime', 'check', 2),
    ('Phone / devices off',              'bedtime', 'time',  3),
    ('Phone on charger (away from bed)', 'bedtime', 'check', 4),
    ('Brush teeth',                      'morning', 'check', 1),
    ('Take meds / vitamins',             'morning', 'check', 2),
    ('Drink water',                      'morning', 'check', 3),
    ('Get some sunlight',                'morning', 'check', 4);
  `,

  // 2 — routine items can sync between devices, and have a real order
  `
  -- uid: the item's identity across devices (ids differ per device). updated_at: newest edit wins.
  ALTER TABLE routine_items ADD COLUMN uid TEXT;
  ALTER TABLE routine_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
  UPDATE routine_items SET uid = lower(hex(randomblob(8)));
  CREATE UNIQUE INDEX routine_items_uid_idx ON routine_items (uid);

  -- Items added in the app all had position 0. Number each check-in's list 1, 2, 3… as it shows now.
  UPDATE routine_items SET sort_order = r.n
  FROM (SELECT id, row_number() OVER (PARTITION BY phase ORDER BY sort_order, id) AS n FROM routine_items) AS r
  WHERE r.id = routine_items.id;
  `,

  // 3 — a third routine list, "anytime"
  `
  -- SQLite can't change a CHECK, so routine_items is rebuilt with 'anytime' allowed. The ticks
  -- (entry_routine) point at it, so they are set aside first and put back afterwards: dropping
  -- routine_items while they still pointed at it would delete them (ON DELETE CASCADE).
  CREATE TABLE entry_routine_keep AS SELECT entry_id, item_id, value FROM entry_routine;
  DROP TABLE entry_routine;

  CREATE TABLE routine_items_new (
    id         INTEGER PRIMARY KEY,
    label      TEXT NOT NULL,
    phase      TEXT NOT NULL CHECK (phase IN ('bedtime', 'morning', 'anytime')),
    kind       TEXT NOT NULL DEFAULT 'check' CHECK (kind IN ('check', 'time', 'number', 'text')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)), -- hidden, history kept
    uid        TEXT,
    updated_at TEXT NOT NULL DEFAULT ''
  ) STRICT;
  INSERT INTO routine_items_new (id, label, phase, kind, sort_order, archived, uid, updated_at)
    SELECT id, label, phase, kind, sort_order, archived, uid, updated_at FROM routine_items;
  DROP TABLE routine_items;
  ALTER TABLE routine_items_new RENAME TO routine_items;
  CREATE UNIQUE INDEX routine_items_uid_idx ON routine_items (uid);

  CREATE TABLE entry_routine (
    entry_id INTEGER NOT NULL REFERENCES entries(id)       ON DELETE CASCADE,
    item_id  INTEGER NOT NULL REFERENCES routine_items(id) ON DELETE CASCADE,
    value    TEXT    NOT NULL CHECK (json_valid(value)),   -- JSON: true | "…" | 2
    PRIMARY KEY (entry_id, item_id)
  ) STRICT;
  INSERT INTO entry_routine (entry_id, item_id, value) SELECT entry_id, item_id, value FROM entry_routine_keep;
  DROP TABLE entry_routine_keep;
  `,

  // 4 — tags can be hidden (like routine items: off the list, history kept)
  `
  ALTER TABLE tags ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));
  `,

  // 5 — "how rested" can be deliberately left empty
  `
  -- The app pre-selects 3 for "rested". 1 here means you cleared it on purpose, so an empty
  -- rested stays empty instead of going back to 3.
  ALTER TABLE entries ADD COLUMN rested_skipped INTEGER NOT NULL DEFAULT 0 CHECK (rested_skipped IN (0, 1));
  `,

  // 6 — when a routine item was hidden, so earlier nights keep it in their summary
  `
  -- The first night (YYYY-MM-DD) the item no longer counts. NULL = not hidden, or hidden before
  -- this was kept and with no date to go on (then it's left out of every night, as before).
  ALTER TABLE routine_items ADD COLUMN hidden_since TEXT;
  -- Items already hidden: their last edit is the best guess for when.
  UPDATE routine_items SET hidden_since = date(updated_at) WHERE archived = 1 AND updated_at <> '';
  `,
];

export async function migrate(db: SQLiteDatabase) {
  // Per-connection settings (not stored in the file), so they run every launch.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;

  for (let v = applied; v < MIGRATIONS.length; v++) {
    await transaction(db, async (tx) => {
      await tx.execAsync(MIGRATIONS[v]);
      await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
