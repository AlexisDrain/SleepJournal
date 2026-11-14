// A big import goes in small batches: it says how far it got, and nothing waits on one long
// transaction. Importing again skips the nights already there (so a cut-off import carries on).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importCsvText } from '@/db/csv';
import { store } from '@/db/store';

const night = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const csv = ['Night of,Tried to sleep,Bedtime note', ...Array.from({ length: 60 }, (_, i) => `${night(i)},11:30 PM,night ${i}`)].join('\n');

test('progress in batches, every night saved', async () => {
  const steps: [number, number][] = [];
  const r = await importCsvText(csv, (done, total) => steps.push([done, total]));
  assert.deepEqual(steps, [[0, 60], [25, 60], [50, 60], [60, 60]]);
  assert.equal(r.imported, 60);
  assert.equal((await store.getEntry(night(59)))?.bedtimeNote, 'night 59');
});

test('again: all skipped, nothing doubled', async () => {
  const r = await importCsvText(csv);
  assert.equal(r.imported, 0);
  assert.equal(r.skipped, 60);
});

test('a wrong file changes nothing', async () => {
  await assert.rejects(importCsvText('Date,Sleep\n2025-05-01,8'), /no "Night of" column/);
});
