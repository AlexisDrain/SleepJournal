// Minimal expo-sqlite async API on top of node:sqlite.
const { DatabaseSync } = require('node:sqlite');
const args = (p) => (p.length === 1 && Array.isArray(p[0]) ? p[0] : p);
class Db {
  constructor(path) { this.d = new DatabaseSync(path); }
  async execAsync(sql) { this.d.exec(sql); }
  async runAsync(sql, ...p) { const r = this.d.prepare(sql).run(...args(p)); return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) }; }
  async getFirstAsync(sql, ...p) { return this.d.prepare(sql).get(...args(p)) ?? null; }
  async getAllAsync(sql, ...p) { return this.d.prepare(sql).all(...args(p)); }
  async withExclusiveTransactionAsync(fn) {
    this.d.exec('BEGIN EXCLUSIVE');
    try { await fn(this); this.d.exec('COMMIT'); } catch (e) { this.d.exec('ROLLBACK'); throw e; }
  }
}
module.exports = { openDatabaseAsync: async () => new Db(':memory:') };
