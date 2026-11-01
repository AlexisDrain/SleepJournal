// Two routine items with one name share a column in the sheet. A tick on the one you can see has
// to survive the sheet being read back. ("It stays after syncing, and it's gone after a reload.")
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
(globalThis as any).fetch = async (_url: string, init: any) =>
  ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });
const second = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second

test('a tick stays when a hidden item further down has the same name', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  const shown = await store.routine.create({ label: 'Stretch', phase: 'morning', kind: 'check' });
  const old = await store.routine.create({ label: 'Stretch', phase: 'morning', kind: 'check' });
  await store.routine.update(old.id, { archived: true });
  const N = '2026-10-30';
  await store.saveEntry(N, { routine: { [shown.id]: true } });
  await syncNow();
  assert.equal((await store.getEntry(N))!.routine[shown.id], true, 'after the sync');
  await second();
  await syncNow(); // what opening the app does
  assert.equal((await store.getEntry(N))!.routine[shown.id], true, 'after the next sync');
});

test('a tick reaches the visible item when the hidden one comes first', async () => {
  const old = await store.routine.create({ label: 'Walk', phase: 'morning', kind: 'check' });
  const shown = await store.routine.create({ label: 'Walk', phase: 'morning', kind: 'check' });
  await store.routine.update(old.id, { archived: true });
  const N = '2026-10-29';
  await store.saveEntry(N, { routine: { [shown.id]: true } });
  await syncNow();
  await second();
  await syncNow();
  const r = (await store.getEntry(N))!.routine;
  assert.equal(r[shown.id], true);
  assert.equal(r[old.id] ?? null, null, 'the hidden one stays unticked');
});
