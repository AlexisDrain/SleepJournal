/**
 * @OnlyCurrentDoc
 *
 * The line above limits this script to the one spreadsheet it lives in. Google then asks only for
 * "View and manage spreadsheets that this application has been installed in": no access to your
 * other files or to Google Drive.
 */

/**
 * Sleep Journal ↔ Google Sheets sync.
 *
 * Paste this into Extensions → Apps Script of your own (private) spreadsheet, then follow
 * google-sheets/README.md. The app talks to it over HTTPS POST with a secret key, so the app
 * never needs your Google login and the sheet never has to be shared.
 *
 * What it does with your sheet:
 *   - one tab per year ("2025", "2026"…), rows sorted by night, colored headers like the app's export
 *   - adds new nights and updates changed ones; the newest version of a night wins (the "Updated" column)
 *   - never deletes rows, and leaves any extra columns you add alone
 *   - makes no backup copies of its own: Google Sheets already keeps every earlier version
 *     (File → Version history), and that needs no extra permissions
 *   - when you edit a cell by hand, stamps that row's "Updated" so the app picks up your edit
 *   - hides the columns you switched off in the app (they still sync; unhide them any time) and
 *     keeps the computed columns (day, hours asleep, the "●●○● 3/4" routine summaries) up to date
 *   - keeps your routine checklist (names, order, hidden items) in a "Routine items" tab, so every
 *     device shows the same list; when an item is renamed, its column in the year tabs is renamed too
 */

/**
 * Bump this whenever the script changes in a way the app should know about. The app compares it
 * with the version it was built for and tells the user when their sheet's script is out of date.
 */
const SCRIPT_VERSION = 4;

const NIGHT = 'Night of';
const UPDATED = 'Updated';
// The routine checklist, one row per item. The app owns it; hand edits here are picked up too.
const ROUTINE_TAB = 'Routine items';
const ROUTINE_COLS = ['Id', 'Check-in', 'Item', 'Records', 'Order', 'Hidden', UPDATED];
const ROUTINE_KINDS = ['check', 'time', 'number', 'text'];
// An item's column in the year tabs is this + its name, e.g. "Bedtime: Brush teeth" (same as the app).
const ROUTINE_PREFIX = { bedtime: 'Bedtime: ', morning: 'Morning: ' };
// [header color, cell tint] per column group, same as the app's .xlsx export
const COLORS = {
  other: ['#b7e4c7', '#eaf7ef'],
  bedtime: ['#b9c4ff', '#eceffd'],
  morning: ['#ffd98a', '#fff6e0'],
};

// ---------- one-time setup (run these from the editor) ----------

/**
 * Step 1: creates the secret key the app will use. Safe to run again (keeps the existing key).
 * A key only counts for the spreadsheet it was made in, so a copy of this sheet (for example one
 * made from a shared template) always gets a brand-new key here and never inherits someone else's.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!keyBelongsHere_(props)) {
    props.setProperty('SECRET', newKey_());
    props.setProperty('SECRET_FOR', SpreadsheetApp.getActiveSpreadsheet().getId());
  }
  Logger.log('Secret key is ready. Next: Deploy → New deployment → Web app, then run showConnectionCode.');
}

/**
 * After deploying: prints your secret key. Keep it private.
 * The app asks for two things: this key, and your Web app URL. Only the Deploy dialog can show
 * the URL (run from the editor, a script only sees its "/dev" test address, which the app can't use).
 */
function showConnectionCode() {
  Logger.log(
    'SECRET KEY (paste into "Secret key" in the app):\n' + secret_() + '\n\n' +
    'WEB APP URL (paste into "Web app URL" in the app):\n' +
    'Deploy → Manage deployments → copy the Web app URL. It ends in /exec.'
  );
}

/** If the code ever leaks: makes a new key. The old code stops working; paste the new one into the app. */
function rotateSecret() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SECRET', newKey_());
  props.setProperty('SECRET_FOR', SpreadsheetApp.getActiveSpreadsheet().getId());
  showConnectionCode();
}

// ---------- web app ----------

function doGet() {
  return ContentService.createTextOutput('Sleep Journal sync is running.');
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request' });
  }
  if (!secretMatches_(req.secret)) return json_({ ok: false, error: 'Wrong connection code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // one sync at a time
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // url: this spreadsheet's own address, for the app's "Open sheet" button. Opening it still needs your Google login.
    if (req.action === 'ping') return json_({ ok: true, sheet: ss.getName(), url: ss.getUrl(), version: SCRIPT_VERSION });
    if (req.action === 'push') return json_(withVersion_(push_(ss, req.columns, req.rows)));
    if (req.action === 'pull') {
      const pulled = pull_(ss, req.since || '');
      pulled.sheet = ss.getName();
      pulled.url = ss.getUrl();
      return json_(withVersion_(pulled));
    }
    if (req.action === 'routine-get') return json_(withVersion_({ ok: true, items: routineGet_(ss) }));
    if (req.action === 'routine-set') return json_(withVersion_({ ok: true, items: routineSet_(ss, req.items || []) }));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- push: app → sheet ----------

/**
 * columns: [{ header, group, numeric, derived, hidden, note }]
 *   derived: computed by the app (always refreshed, even when the sheet's row is newer)
 *   hidden:  switched off in the app (the column is hidden here, not removed)
 *   note:    shown when you hover the header (the legend of a routine summary)
 * rows:    [{ nightOf: '2026-09-26', updated: '2026-09-27T05:30:00Z', values: { header: value } }]
 */
function push_(ss, columns, rows) {
  if (!rows || rows.length === 0) return { ok: true, written: 0, kept: 0 };
  const byYear = {};
  rows.forEach(function (r) {
    const y = r.nightOf.slice(0, 4);
    (byYear[y] = byYear[y] || []).push(r);
  });
  let written = 0;
  let kept = 0;
  Object.keys(byYear).sort().forEach(function (year) {
    const res = mergeInto_(yearSheet_(ss, year, columns), columns, byYear[year]);
    written += res.written;
    kept += res.kept;
  });
  removeEmptyDefaultSheet_(ss);
  return { ok: true, written: written, kept: kept };
}

function mergeInto_(sh, columns, rows) {
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const col = {};
  headers.forEach(function (h, i) { col[h] = i; });

  const lastRow = sh.getLastRow();
  const data = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const index = {};
  data.forEach(function (row, i) {
    const iso = toIsoNight_(row[col[NIGHT]]);
    if (iso) index[iso] = i;
  });

  let written = 0;
  let kept = 0;
  rows.forEach(function (r) {
    let row;
    if (index[r.nightOf] !== undefined) {
      row = data[index[r.nightOf]];
      // Newest wins: keep the sheet's version if it was changed at the same time or later,
      // but still refresh the columns the app computes.
      if (toIsoTime_(row[col[UPDATED]]) >= r.updated) {
        columns.forEach(function (c) {
          if (c.derived) row[col[c.header]] = cellValue_(c, r.values[c.header]);
        });
        kept++;
        return;
      }
    } else {
      row = headers.map(function () { return ''; });
      index[r.nightOf] = data.length;
      data.push(row);
    }
    columns.forEach(function (c) {
      row[col[c.header]] = cellValue_(c, r.values[c.header]);
    });
    row[col[UPDATED]] = r.updated;
    written++;
  });

  // Keep rows in night order (whole rows move, so your extra columns stay with their night).
  data.sort(function (a, b) {
    const x = toIsoNight_(a[col[NIGHT]]) || '9999';
    const y = toIsoNight_(b[col[NIGHT]]) || '9999';
    return x < y ? -1 : x > y ? 1 : 0;
  });
  if (data.length) {
    ensureRows_(sh, data.length + 1);
    sh.getRange(2, 1, data.length, lastCol).setValues(data);
  }
  return { written: written, kept: kept };
}

// ---------- pull: sheet → app ----------

/**
 * Every row changed after `since`, as the text you see in the sheet:
 * { tabs: [{ header: [...], rows: [{ nightOf, updated, cells: [...] }] }] }
 */
function pull_(ss, since) {
  const tabs = [];
  ss.getSheets().forEach(function (sh) {
    if (!/^\d{4}$/.test(sh.getName()) || sh.getLastRow() < 2) return;
    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const u = headers.indexOf(UPDATED);
    const n = headers.indexOf(NIGHT);
    if (u < 0 || n < 0) return;
    const shown = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getDisplayValues();
    const raw = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
    const rows = [];
    shown.forEach(function (row, i) {
      const updated = toIsoTime_(raw[i][u]);
      const night = toIsoNight_(raw[i][n]);
      if (!night || !updated || updated <= since) return;
      rows.push({ nightOf: night, updated: updated, cells: row });
    });
    if (rows.length) tabs.push({ header: headers, rows: rows });
  });
  return { ok: true, tabs: tabs };
}

// ---------- the routine list ----------

/**
 * items: [{ id, phase: 'bedtime' | 'morning', label, kind, order, hidden, updated }]
 *   id:      made by the app; it stays the same when the item is renamed, which is how a rename is
 *            told apart from "one item removed, another added"
 *   updated: when the item last changed; the newest version of an item wins
 */
function routineGet_(ss) {
  const items = readRoutine_(ss);
  renameRoutineColumns_(ss, items);
  return items;
}

/** The app's list → the tab. Items the app didn't send are kept; a newer version here is kept too. */
function routineSet_(ss, incoming) {
  const items = readRoutine_(ss);
  const at = {};
  items.forEach(function (it, i) { at[it.id] = i; });
  incoming.forEach(function (raw) {
    const it = routineItem_(raw.id, raw.phase, raw.label, raw.kind, raw.order, raw.hidden, raw.updated);
    if (!it || !it.id) return;
    if (at[it.id] === undefined) {
      at[it.id] = items.length;
      items.push(it);
    } else if (it.updated >= items[at[it.id]].updated) {
      items[at[it.id]] = it;
    }
  });
  writeRoutine_(ss, items);
  renameRoutineColumns_(ss, items);
  return items;
}

/** One cleaned-up item, or null if it has no name or check-in. */
function routineItem_(id, phase, label, kind, order, hidden, updated) {
  phase = String(phase || '').trim().toLowerCase();
  label = String(label || '').trim();
  kind = String(kind || '').trim().toLowerCase();
  if (!label || !ROUTINE_PREFIX[phase]) return null;
  return {
    id: String(id || '').trim(),
    phase: phase,
    label: label,
    kind: ROUTINE_KINDS.indexOf(kind) >= 0 ? kind : 'check',
    order: Number(order) || 0,
    hidden: hidden === true || /^(yes|true)$/i.test(String(hidden || '').trim()),
    updated: toIsoTime_(updated),
  };
}

function readRoutine_(ss) {
  const sh = ss.getSheetByName(ROUTINE_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  const items = [];
  let fixed = false;
  sh.getRange(2, 1, sh.getLastRow() - 1, ROUTINE_COLS.length).getValues().forEach(function (r) {
    const it = routineItem_(r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
    if (!it) return;
    if (!it.id) { // a row typed in by hand: give it an id so it can sync
      it.id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      it.updated = nowIso_();
      fixed = true;
    }
    items.push(it);
  });
  if (fixed) writeRoutine_(ss, items);
  return items;
}

function writeRoutine_(ss, items) {
  let sh = ss.getSheetByName(ROUTINE_TAB);
  const n = ROUTINE_COLS.length;
  if (!sh) {
    sh = ss.insertSheet(ROUTINE_TAB, ss.getSheets().length);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, n).setValues([ROUTINE_COLS]).setFontWeight('bold').setBackground(COLORS.other[0]);
    sh.getRange(1, 1).setNote(
      'Your routine checklist, kept in step with the Sleep Journal app on every device. ' +
      'It is easiest to change items in the app (Routines → Edit). Do not change the Id column.'
    );
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), n).setNumberFormat('@'); // plain text
    sh.getRange(2, 5, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('0'); // Order
  }
  const sorted = items.slice().sort(function (a, b) {
    return a.phase === b.phase ? a.order - b.order : a.phase === 'bedtime' ? -1 : 1;
  });
  const old = sh.getLastRow() - 1;
  if (old > 0) sh.getRange(2, 1, old, n).clearContent();
  if (!sorted.length) return;
  ensureRows_(sh, sorted.length + 1);
  sh.getRange(2, 1, sorted.length, n).setValues(sorted.map(function (it) {
    return [it.id, it.phase, it.label, it.kind, it.order, it.hidden ? 'yes' : '', it.updated];
  }));
}

/**
 * When an item's name (or check-in) changed since last time, renames its column in every year tab,
 * so the nights already recorded stay in one column instead of splitting into an old and a new one.
 */
function renameRoutineColumns_(ss, items) {
  const props = PropertiesService.getScriptProperties();
  const before = JSON.parse(props.getProperty('ROUTINE_HEADERS') || '{}');
  const now = {};
  const inUse = {};
  items.forEach(function (it) {
    now[it.id] = ROUTINE_PREFIX[it.phase] + it.label;
    inUse[now[it.id]] = true;
  });
  items.forEach(function (it) {
    const from = before[it.id];
    const to = now[it.id];
    if (!from || from === to || inUse[from]) return; // another item still uses the old name: leave its column be
    ss.getSheets().forEach(function (sh) {
      if (/^\d{4}$/.test(sh.getName())) renameColumn_(sh, from, to, it.phase);
    });
  });
  const wanted = JSON.stringify(now);
  if (wanted !== JSON.stringify(before)) props.setProperty('ROUTINE_HEADERS', wanted);
}

function renameColumn_(sh, from, to, group) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return;
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const a = headers.indexOf(from);
  if (a < 0) return;
  const b = headers.indexOf(to);
  const rows = sh.getLastRow() - 1;
  if (b < 0) {
    const colors = COLORS[group] || COLORS.other;
    sh.getRange(1, a + 1).setValue(to).setBackground(colors[0]);
    sh.getRange(2, a + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setBackground(colors[1]);
  } else {
    // Both columns exist (the item was split by an earlier rename): fold the old one into the new one.
    if (rows > 0) {
      const oldValues = sh.getRange(2, a + 1, rows, 1).getValues();
      const target = sh.getRange(2, b + 1, rows, 1);
      const values = target.getValues();
      values.forEach(function (v, i) {
        if (v[0] === '' && oldValues[i][0] !== '') v[0] = oldValues[i][0];
      });
      target.setValues(values);
    }
    sh.deleteColumn(a + 1);
  }
  PropertiesService.getScriptProperties().deleteProperty('LAYOUT_' + sh.getName()); // re-apply hidden columns and notes
}

// ---------- hand edits ----------

/** Runs when you edit the sheet by hand: marks the edited rows as changed so the app pulls them. */
function onEdit(e) {
  const sh = e.range.getSheet();
  const name = sh.getName();
  if ((!/^\d{4}$/.test(name) && name !== ROUTINE_TAB) || e.range.getRow() < 2) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const u = headers.indexOf(UPDATED);
  if (u < 0) return;
  const first = e.range.getColumn();
  const last = first + e.range.getNumColumns() - 1;
  if (first === u + 1 && last === u + 1) return; // editing "Updated" itself
  const n = e.range.getNumRows();
  const stamps = [];
  for (let i = 0; i < n; i++) stamps.push([nowIso_()]);
  sh.getRange(e.range.getRow(), u + 1, n, 1).setValues(stamps);
}

// ---------- sheet layout ----------

function yearSheet_(ss, year, columns) {
  let sh = ss.getSheetByName(year);
  if (!sh) {
    // Year tabs stay in order at the bottom: insert before the first later year, else at the end.
    const sheets = ss.getSheets();
    let at = sheets.length;
    for (let i = 0; i < sheets.length; i++) {
      const name = sheets[i].getName();
      if (/^\d{4}$/.test(name) && name > year) { at = i; break; }
    }
    sh = ss.insertSheet(year, at);
    sh.setFrozenRows(1);
    sh.setFrozenColumns(1);
  }
  ensureColumns_(sh, columns.concat([{ header: UPDATED, group: 'other', numeric: false }]));
  applyLayout_(sh, columns);
  return sh;
}

/**
 * Adds any missing app columns (plain text unless numeric), colored by group. A new column goes
 * right after the app column that comes before it, so related columns stay together; your own
 * columns just move over.
 */
function ensureColumns_(sh, columns) {
  const lastCol = sh.getLastColumn();
  const headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  columns.forEach(function (c, i) {
    if (headers.indexOf(c.header) >= 0) return;
    const before = i > 0 ? headers.indexOf(columns[i - 1].header) : -1; // 0-based position of the previous app column
    let at;
    if (before >= 0 && before < headers.length - 1) {
      sh.insertColumnAfter(before + 1);
      at = before + 2;
      headers.splice(before + 1, 0, c.header);
    } else {
      at = headers.length + 1;
      headers.push(c.header);
      if (sh.getMaxColumns() < at) sh.insertColumnsAfter(sh.getMaxColumns(), at - sh.getMaxColumns());
    }
    const colors = COLORS[c.group] || COLORS.other;
    sh.getRange(1, at).setValue(c.header).setFontWeight('bold').setBackground(colors[0]).setWrap(true);
    const body = sh.getRange(2, at, Math.max(sh.getMaxRows() - 1, 1), 1);
    body.setBackground(colors[1]);
    body.setNumberFormat(c.numeric ? '0.##' : '@'); // text stops Sheets turning "11:30 PM" into a date
  });
}

/** Hides/shows columns and sets header notes as the app asked. Only does the work when something changed. */
function applyLayout_(sh, columns) {
  const props = PropertiesService.getScriptProperties();
  const key = 'LAYOUT_' + sh.getName();
  const wanted = JSON.stringify(columns.map(function (c) { return [c.header, !!c.hidden, c.note || '']; }));
  if (props.getProperty(key) === wanted) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  columns.forEach(function (c) {
    const at = headers.indexOf(c.header) + 1;
    if (!at) return;
    if (c.hidden) sh.hideColumns(at);
    else sh.showColumns(at);
    sh.getRange(1, at).setNote(c.note || '');
  });
  props.setProperty(key, wanted);
}

function cellValue_(c, v) {
  return v === null || v === undefined ? '' : c.numeric ? Number(v) : String(v);
}

function ensureRows_(sh, rows) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
}

/** A brand-new spreadsheet starts with an empty "Sheet1"; drop it once year tabs exist. */
function removeEmptyDefaultSheet_(ss) {
  const s = ss.getSheetByName('Sheet1');
  if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
}

// ---------- helpers ----------

/**
 * True when a key exists and was made for this very spreadsheet. A sheet set up before keys were
 * tied to their spreadsheet has no record yet: it keeps its key and gets the record now.
 */
function keyBelongsHere_(props) {
  if (!props.getProperty('SECRET')) return false;
  const here = SpreadsheetApp.getActiveSpreadsheet().getId();
  const madeFor = props.getProperty('SECRET_FOR');
  if (!madeFor) {
    props.setProperty('SECRET_FOR', here);
    return true;
  }
  return madeFor === here;
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  if (!keyBelongsHere_(props)) throw new Error('Run setup first.');
  return props.getProperty('SECRET');
}

function secretMatches_(given) {
  const props = PropertiesService.getScriptProperties();
  if (!keyBelongsHere_(props)) return false; // a copied sheet must run setup to get its own key
  const expected = props.getProperty('SECRET');
  if (!expected || typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function newKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function nowIso_() {
  return new Date().toISOString().slice(0, 19) + 'Z';
}

/** "9-26-2026", "2026-09-26" or a date the sheet converted → "2026-09-26" */
function toIsoNight_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? s : null;
}

/** The "Updated" cell → "2026-09-27T05:30:00Z" ('' if empty) */
function toIsoTime_(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 19) + 'Z';
  return String(v || '').trim();
}

function withVersion_(result) {
  result.version = SCRIPT_VERSION;
  return result;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
