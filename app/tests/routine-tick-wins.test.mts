// A checkmark beats an untick when two devices disagree, even if the checkmark came first.
// Unticking something this device already knows was ticked still works.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { sheetPayload } from '@/db/csv';
import { store } from '@/db/store';
import { connect, syncNow } from '@/db/sync';
import type { Entry } from '@/lib/types';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_url: string, init: any) =>
  ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });

const otherDevice = async (e: Entry) => {
  const body = { secret, action: 'push', ...(await sheetPayload([e])) };
  env.ctx.doPost({ postData: { contents: JSON.stringify(body) } });
};
const second = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second
const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';

test('a tick from another device beats an untick here that came later', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  const item = await store.routine.create({ label: 'Stretch', phase: 'morning', kind: 'check' });
  const N = '2026-10-27';
  await store.saveEntry(N, { dream: 'start' });
  await syncNow();
  const base = (await store.getEntry(N))!;
  await second();
  await otherDevice({ ...base, routine: { [item.id]: true }, updatedAt: stamp() });
  await second();
  await store.saveEntry(N, { routine: { [item.id]: null } }); // a later untick, not sent yet
  await syncNow();
  assert.equal((await store.getEntry(N))!.routine[item.id], true);
  await second();
  await syncNow();
  assert.equal((await store.getEntry(N))!.routine[item.id], true, 'and it stays');
});

test('unticking your own tick still works, right after sending it', async () => {
  const item = await store.routine.create({ label: 'Read', phase: 'bedtime', kind: 'check' });
  const N = '2026-10-24';
  await store.saveEntry(N, { routine: { [item.id]: true } });
  await syncNow();
  await second();
  await store.saveEntry(N, { routine: { [item.id]: null } });
  await syncNow();
  await second();
  await syncNow();
  assert.equal((await store.getEntry(N))!.routine[item.id] ?? null, null);
});

test('unticking on a device that received the tick still works', async () => {
  const item = await store.routine.create({ label: 'Tea', phase: 'bedtime', kind: 'check' });
  const N = '2026-10-23';
  await store.saveEntry(N, { dream: 'start' });
  await syncNow();
  const base = (await store.getEntry(N))!;
  await second();
  await otherDevice({ ...base, routine: { [item.id]: true }, updatedAt: stamp() });
  await syncNow(); // the tick arrives here
  assert.equal((await store.getEntry(N))!.routine[item.id], true);
  await second();
  await store.saveEntry(N, { routine: { [item.id]: null } });
  await syncNow();
  await second();
  await syncNow();
  assert.equal((await store.getEntry(N))!.routine[item.id] ?? null, null);
});
