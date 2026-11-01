// Version 6 of the sheet script: a year tab with nothing new isn't read, and nothing new is ever missed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { store } from '@/db/store';
import { connect, getSyncState, syncNow } from '@/db/sync';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_url: string, init: any) =>
  ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });
const post = (body: object) => JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify({ secret, ...body }) } }).text);
const second = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second

/** Which year tabs get read during `fn`. */
function readsDuring(fn: () => void) {
  const read: string[] = [];
  const tabs = env.ss.getSheets().filter((s: any) => /^\d{4}$/.test(s.getName()));
  const originals = tabs.map((s: any) => s.getLastRow);
  tabs.forEach((s: any) => { s.getLastRow = function (this: any) { read.push(s.getName()); return Object.getPrototypeOf(s).getLastRow.call(this); }; });
  fn();
  tabs.forEach((s: any, i: number) => { s.getLastRow = originals[i]; if (s.getLastRow === Object.getPrototypeOf(s).getLastRow) delete s.getLastRow; });
  return [...new Set(read)];
}
const cellOf = (tab: any, header: string) => tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0].indexOf(header) + 1;

test('old tabs are skipped, and a change to one is still found', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await store.saveEntry('2025-03-01', { dream: 'old year' });
  await store.saveEntry('2026-03-01', { dream: 'this year' });
  await syncNow();
  await second();
  await syncNow(); // reads both tabs and remembers their newest change
  const { lastPulled } = await getSyncState();
  assert.deepEqual(readsDuring(() => post({ action: 'pull', since: lastPulled })), [], 'nothing new: nothing read');

  await second();
  await store.saveEntry('2026-03-01', { dream: 'edited' });
  await syncNow();
  const since = (await getSyncState()).lastPulled;
  assert.deepEqual(readsDuring(() => post({ action: 'pull', since })), ['2026'], 'only the changed year');

  // A change by hand in the skipped year.
  await second();
  const old = env.ss.getSheetByName('2025');
  old.getRange(2, cellOf(old, 'Dream')).setValue('fixed by hand');
  env.ctx.onEdit({ range: old.getRange(2, cellOf(old, 'Dream')) });
  await syncNow();
  assert.equal((await store.getEntry('2025-03-01'))!.dream, 'fixed by hand');
  await second();
  await store.saveEntry('2025-03-01', { morningNote: 'back in the old year' });
  await syncNow();
  assert.ok(String(old.getRange(2, cellOf(old, 'Morning note')).getValues()[0][0]).includes('back in the old year'));
});

test('a sheet from before this version is read in full, once', async () => {
  assert.equal(post({ action: 'pull', since: '' }).tabs.length, 2);
  await second();
  await syncNow();
  await second();
  await syncNow();
  env.ctx.PropertiesService.getScriptProperties().deleteProperty('NEWEST_2025');
  const { lastPulled } = await getSyncState();
  assert.deepEqual(readsDuring(() => post({ action: 'pull', since: lastPulled })), ['2025']);
  assert.deepEqual(readsDuring(() => post({ action: 'pull', since: lastPulled })), []);
});

test('the sheet reports its exact size', async () => {
  await syncNow();
  const tab = env.ss.getSheetByName('2026');
  assert.ok((await getSyncState()).sheetCells! >= tab.getMaxRows() * tab.getMaxColumns());
});
