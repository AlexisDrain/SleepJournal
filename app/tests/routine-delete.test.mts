// Deleting a routine item is for good: it mustn't come back from the sheet, and other devices lose it too.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { DELETED_ORDER, getDb, store } from '@/db/store';
import { connect, syncNow } from '@/db/sync';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
const post = (body: object) => JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify({ secret, ...body }) } }).text);
(globalThis as any).fetch = async (_url: string, init: any) =>
  ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });
const second = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second
const labels = async () => (await store.routine.list()).map((i) => i.label);
const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';

test('a deleted item stays deleted, even with ticks in its sheet column', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  const item = await store.routine.create({ label: 'Old habit', phase: 'morning', kind: 'check' });
  await store.routine.update(item.id, { archived: true });
  const N = '2026-10-20';
  await store.saveEntry(N, { routine: { [item.id]: true } });
  await syncNow();
  await second();
  await store.routine.remove(item.id);
  assert.ok(!(await labels()).includes('Old habit'));
  assert.equal((await store.getEntry(N))!.routine[item.id] ?? null, null, 'its ticks go');
  await syncNow();
  await second();
  await store.saveEntry(N, { dream: 'an edit, so the night comes back from the sheet' });
  await syncNow();
  await second();
  await syncNow();
  assert.ok(!(await labels()).includes('Old habit'));
  const items = post({ action: 'routine-get' }).items;
  assert.ok(!items.some((i: { label: string }) => i.label === 'Old habit'), 'the name is gone from the sheet');
  const sheet = items.find((i: { id: string }) => i.id === item.uid);
  assert.equal(sheet.label, 'Deleted item #1');
  assert.equal(sheet.order, DELETED_ORDER, 'the sheet tells other devices');
  const tab = env.ss.getSheetByName('2026');
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0] as string[];
  assert.ok(!headers.includes('Morning: Old habit'), 'and from its column');
  const col = headers.indexOf('Morning: Deleted item #1');
  assert.ok(col >= 0, 'which keeps a new name');
  const row = tab.getRange(2, 1, tab.getLastRow() - 1, 1).getValues().findIndex((r: any) => r[0] === N) + 2;
  assert.equal(String(tab.getRange(row, col + 1).getValues()[0][0]), 'yes', 'and its cells');
});

test('an item deleted on another device goes here too, with its ticks', async () => {
  const item = await store.routine.create({ label: 'Gone elsewhere', phase: 'bedtime', kind: 'check' });
  const N = '2026-10-19';
  await store.saveEntry(N, { routine: { [item.id]: true } });
  await syncNow();
  await second();
  post({ action: 'routine-set', items: [{ id: item.uid, phase: 'bedtime', label: 'Gone elsewhere', kind: 'check', order: DELETED_ORDER, hidden: true, updated: stamp() }] });
  await syncNow();
  assert.ok(!(await labels()).includes('Gone elsewhere'));
  assert.equal((await store.getEntry(N))!.routine[item.id] ?? null, null);
});

test('an item deleted before names were replaced gets one at the next sync', async () => {
  const item = await store.routine.create({ label: 'Secret', phase: 'bedtime', kind: 'check' });
  await syncNow();
  await second();
  await store.routine.update(item.id, { archived: true });
  await (await getDb()).runAsync(`UPDATE routine_items SET sort_order = ? WHERE id = ?`, DELETED_ORDER, item.id);
  await syncNow();
  assert.ok(!post({ action: 'routine-get' }).items.some((i: { label: string }) => i.label === 'Secret'));
});

test('a new item can take a deleted name', async () => {
  const old = await store.routine.create({ label: 'Tea', phase: 'bedtime', kind: 'check' });
  await store.routine.remove(old.id);
  const fresh = await store.routine.create({ label: 'Tea', phase: 'bedtime', kind: 'check' });
  const N = '2026-10-18';
  await store.saveEntry(N, { routine: { [fresh.id]: true } });
  await syncNow();
  await second();
  await syncNow();
  assert.equal((await store.getEntry(N))!.routine[fresh.id], true);
});

test('reordering leaves deleted items deleted', async () => {
  const a = await store.routine.create({ label: 'A', phase: 'anytime', kind: 'check' });
  const b = await store.routine.create({ label: 'B', phase: 'anytime', kind: 'check' });
  await store.routine.remove(a.id);
  await store.routine.setOrder('anytime', [b.id]);
  assert.ok(!(await labels()).includes('A'));
});
