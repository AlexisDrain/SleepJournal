// The Google Sheet script (google-sheets/SleepJournalSync.gs) running against a small in-memory
// spreadsheet, so the sync can be tested end to end without Google.
const vm = require('node:vm');
const fs = require('node:fs');

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getDisplayValues() { return this.getValues().map((row) => row.map((v) => (v === '' || v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v)))); }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); return this; }
  setValue(v) { this.sh.set(this.r, this.c, v); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setWrap() { return this; }
  setNumberFormat() { return this; }
  setNote(n) { this.sh.notes.set(this.r + ":" + this.c, n); return this; }
  getNote() { return this.sh.notes.get(this.r + ":" + this.c) || ""; }
  getSheet() { return this.sh; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
}

class Sheet {
  constructor(name) { this.name = name; this.cells = new Map(); this.notes = new Map(); this.hidden = new Set(); this.maxRows = 1000; this.maxCols = 26; }
  key(r, c) { return r + ':' + c; }
  get(r, c) { return this.cells.has(this.key(r, c)) ? this.cells.get(this.key(r, c)) : ''; }
  set(r, c, v) { if (v === '' || v == null) this.cells.delete(this.key(r, c)); else this.cells.set(this.key(r, c), v); }
  getName() { return this.name; }
  getLastRow() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(':')[0]); return m; }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(':')[1]); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  hideColumns(c) { this.hidden.add(c); }
  showColumns(c) { this.hidden.delete(c); }
  insertColumnAfter(pos) {
    const next = new Map();
    for (const [k, v] of this.cells) { const [r, c] = k.split(":").map(Number); next.set(r + ":" + (c > pos ? c + 1 : c), v); }
    this.cells = next;
    this.hidden = new Set([...this.hidden].map((c) => (c > pos ? c + 1 : c)));
    this.maxCols++;
  }
  deleteColumn(pos) {
    const next = new Map();
    for (const [k, v] of this.cells) { const [r, c] = k.split(':').map(Number); if (c === pos) continue; next.set(r + ':' + (c > pos ? c - 1 : c), v); }
    this.cells = next;
    this.hidden = new Set([...this.hidden].filter((c) => c !== pos).map((c) => (c > pos ? c - 1 : c)));
  }
  setFrozenRows() {}
  setFrozenColumns() {}
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
}

function makeEnv(opts = {}) {
  const sheets = [new Sheet('Sheet1')];
  const ss = {
    getName: () => 'Sleep Journal',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/1AbC_d-9/edit',
    getId: () => opts.id || 'ss1',
    getSpreadsheetTimeZone: () => 'America/Los_Angeles',
    getSheets: () => [...sheets],
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n, at) => { const s = new Sheet(n); sheets.splice(at, 0, s); return s; },
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
  };
  const props = opts.props || new Map();
  const backups = [];
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TESTDEPLOYMENT/exec' }) },
    Utilities: { getUuid: () => require('node:crypto').randomUUID(), formatDate: (d) => d.toISOString().slice(0, 10) },
    Logger: { log: (m) => { ctx.lastLog = m; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: () => ({ getFiles: () => { let i = 0; return { hasNext: () => i < backups.length, next: () => backups[i++] }; } }),
      getFileById: () => ({ makeCopy: (name) => backups.push({ name, getDateCreated: () => new Date(), setTrashed() {} }) }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../../google-sheets/SleepJournalSync.gs'), 'utf8'), ctx);
  return { ctx, ss, backups, props };
}

module.exports = { makeEnv };
