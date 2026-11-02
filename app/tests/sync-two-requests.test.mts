// Version 7 of the sheet script: the routine list travels with the nights, so a sync is two requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { store } from '@/db/store';
import { connect, syncNow } from '@/db/sync';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
let actions: string[] = [];
(globalThis as any).fetch = async (_url: string, init: any) => {
  actions.push(JSON.parse(init.body).action);
  return { text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text };
};
const second = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second
const headers = (tab: any) => tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0] as string[];

test('an edit is sent in two requests, a new routine item too', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await store.saveEntry('2026-10-20', { dream: 'first' });
  await syncNow();
  await second();
  actions = [];
  await store.saveEntry('2026-10-20', { dream: 'edited' });
  await syncNow();
  assert.deepEqual(actions, ['pull', 'push']);

  actions = [];
  await store.routine.create({ label: 'Stretch', phase: 'bedtime', kind: 'check' });
  await syncNow();
  assert.deepEqual(actions, ['pull', 'push']);
  assert.ok(env.ctx.doPost({ postData: { contents: JSON.stringify({ secret, action: 'routine-get' }) } }).text.includes('Stretch'));

  actions = [];
  await syncNow();
  assert.deepEqual(actions, ['pull'], 'nothing new: one request');
});

test('a rename not sent yet, while the sheet gets a tick under the old name', async () => {
  const item = await store.routine.create({ label: 'Tea', phase: 'bedtime', kind: 'check' });
  const N = '2026-10-21';
  await store.saveEntry(N, { dream: 'a night' });
  await syncNow();
  await second();
  await store.routine.update(item.id, { label: 'Green tea' });
  // Meanwhile, a tick typed into the sheet by hand under the old name.
  const tab = env.ss.getSheetByName('2026');
  const col = headers(tab).indexOf('Bedtime: Tea') + 1;
  const row = tab.getRange(2, 1, tab.getLastRow() - 1, 1).getValues().findIndex((r: any) => r[0] === N) + 2;
  assert.ok(col > 0 && row > 1);
  tab.getRange(row, col).setValue('yes');
  env.ctx.onEdit({ range: tab.getRange(row, col) });
  await syncNow();
  const labels = (await store.routine.listAll()).filter((i) => i.phase === 'bedtime').map((i) => i.label);
  assert.ok(!labels.includes('Tea'), 'no second item made from the old column');
  assert.equal((await store.getEntry(N))!.routine[item.id], true, 'the tick reached the renamed item');
  assert.ok(headers(tab).includes('Bedtime: Green tea'), 'and the sheet took the new name');
});
