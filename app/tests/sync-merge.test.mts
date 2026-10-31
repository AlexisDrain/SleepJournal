// Two devices changing different fields of the same night: syncing must keep both changes,
// whichever device saved last. ("The phone's woke-up time disappeared after the desktop synced.")
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { sheetPayload } from '@/db/csv';
import { store } from '@/db/store';
import { connect, requestSync, syncNow } from '@/db/sync';
import type { Entry } from '@/lib/types';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
let duringPush: (() => Promise<void>) | null = null; // something that happens while a push is on its way
(globalThis as any).fetch = async (_url: string, init: any) => {
  if (JSON.parse(init.body).action === 'push' && duringPush) { const f = duringPush; duringPush = null; await f(); }
  return { text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text };
};

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

test('an edit that reaches the sheet late still gets past what other devices have seen', async () => {
  // Saved here, but not sent yet (the app was closed at once).
  const late = '2026-10-20';
  await store.saveEntry(late, { dream: 'sent late' });
  const editedAt = (await store.getEntry(late))!.updatedAt;

  // Meanwhile another night, edited later, is already in the sheet: other devices have seen that time.
  await tick();
  const seen = stamp();
  await otherDevice({ ...(await store.getEntry(N))!, nightOf: '2026-10-21', updatedAt: seen });

  await syncNow();
  const sent = cell(late, 'Updated');
  assert.ok(sent > seen, `${sent} must be after ${seen} (edited ${editedAt}), or a device that has seen ${seen} skips it`);
  assert.equal(cell(late, 'Dream'), 'sent late');
});

test('an edit made during a sync goes out right after it, without another trigger', async () => {
  const night = '2026-10-22';
  await store.saveEntry('2026-10-23', { dream: 'starts the sync' });
  duringPush = async () => {
    await store.saveEntry(night, { dream: 'tapped mid-sync' });
    requestSync(0); // what saving does: it finds a sync already running
    await new Promise((r) => setTimeout(r, 20));
  };
  await syncNow();
  for (let i = 0; i < 50 && (await store.unsyncedFields()).size > 0; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(cell(night, 'Dream'), 'tapped mid-sync');
});

test('an edit during a send, in the same second and to the same field, still goes out', async () => {
  const night = '2026-10-24';
  await store.saveEntry(night, { dream: 'first' });
  duringPush = async () => {
    const sameSecond = (await store.getEntry(night))!.updatedAt; // as it's being sent
    await store.saveEntry(night, { dream: 'second' });
    await store.redate(night, sameSecond); // times are kept to the second: force the clash
  };
  await syncNow();
  assert.equal(cell(night, 'Dream'), 'first', 'the send that was already on its way');
  assert.ok((await store.unsyncedFields()).has(night), 'the newer edit is still waiting');
  await syncNow();
  assert.equal(cell(night, 'Dream'), 'second');
  assert.equal((await store.unsyncedFields()).has(night), false);
});
