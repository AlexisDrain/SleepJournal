// Two devices changing different fields of the same night: syncing must keep both changes,
// whichever device saved last. ("The phone's woke-up time disappeared after the desktop synced.")
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
(globalThis as any).fetch = async (_url: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });

/** The other device: it sends its copy of a night straight to the sheet. */
const otherDevice = async (e: Entry) => {
  const body = { secret, action: 'push', ...(await sheetPayload([e])) };
  env.ctx.doPost({ postData: { contents: JSON.stringify(body) } });
};
const cell = (night: string, header: string) => {
  const y = env.ss.getSheetByName(night.slice(0, 4));
  const h = y.getRange(1, 1, 1, y.getLastColumn()).getValues()[0] as string[];
  const row = y.getRange(2, 1, y.getLastRow() - 1, 1).getValues().findIndex((r: any) => r[0] === night) + 2;
  return String(y.getRange(row, h.indexOf(header) + 1).getValues()[0][0]);
};
const tick = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second
const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';
const N = '2026-10-27';

test('a field each, saved on two devices', async () => {
  await store.saveEntry(N, { triedSleepAt: '2026-10-27T23:30:00-07:00' });
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await syncNow();
  const base = (await store.getEntry(N))!;

  // The other device writes the dream; this one syncs and gets it.
  await tick();
  const other1 = { ...base, dream: 'a dream', updatedAt: stamp() };
  await otherDevice(other1);
  await syncNow();
  assert.equal((await store.getEntry(N))!.dream, 'a dream');

  // The other device adds the woke-up time; this one, not knowing yet, writes a note of its own later.
  await tick();
  const other2 = { ...other1, wokeAt: '2026-10-28T07:15:00-07:00', updatedAt: stamp() };
  await otherDevice(other2);
  await tick();
  await store.saveEntry(N, { morningNote: 'from here' });
  await syncNow();
  assert.equal(cell(N, 'Woke up'), '7:15 AM', 'the sheet keeps the other device\'s time');
  assert.equal(cell(N, 'Morning note'), 'from here');
  const here = (await store.getEntry(N))!;
  assert.equal(here.wokeAt, '2026-10-28T07:15:00-07:00', 'and this device gets it');
  assert.equal(here.dream, 'a dream');

  // The other way round: an unsent edit here, then a newer edit of another field there.
  await tick();
  await store.saveEntry(N, { bedtimeNote: 'not sent yet' });
  await tick();
  await otherDevice({ ...other2, morningNote: 'from here', rested: 4, updatedAt: stamp() });
  await syncNow();
  const after = (await store.getEntry(N))!;
  assert.equal(after.rested, 4, 'the newer edit arrives');
  assert.equal(after.bedtimeNote, 'not sent yet', 'the unsent edit here survives');
  assert.equal(cell(N, 'Bedtime note'), 'not sent yet', 'and reaches the sheet');
  assert.equal(cell(N, 'Woke up'), '7:15 AM');
});
