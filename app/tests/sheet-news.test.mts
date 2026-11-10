// The popup after a sync: it counts nights brought in from the sheet (new here, or changed there)
// and nights saved to it, and not this device's own changes coming back.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { sheetNewsText } from '@/components/SheetToast';
import { sheetPayload } from '@/db/csv';
import { store } from '@/db/store';
import { connect, onSheetNews, syncNow, type SheetNews } from '@/db/sync';
import type { Entry } from '@/lib/types';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_url: string, init: any) => ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });
/** The other device: it sends its copy of a night straight to the sheet. */
const otherDevice = async (e: Entry) => {
  env.ctx.doPost({ postData: { contents: JSON.stringify({ secret, action: 'push', ...(await sheetPayload([e])) }) } });
};
const tick = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second
const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';

test('the words', () => {
  assert.equal(sheetNewsText({ added: 1, updated: 0 }), 'From your Google Sheet: 1 new night');
  assert.equal(sheetNewsText({ added: 0, updated: 2 }), 'From your Google Sheet: 2 nights updated');
  assert.equal(sheetNewsText({ added: 3, updated: 1 }), 'From your Google Sheet: 3 new nights, 1 updated');
});

test('a sync announces what it saved, and nights from another device', async () => {
  const news: SheetNews[] = [];
  onSheetNews((n) => news.push(n));
  await store.saveEntry('2026-11-01', { triedSleepAt: '2026-11-01T23:00:00' });
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await syncNow();
  assert.deepEqual(news, [{ added: 0, updated: 0, saved: 1 }], 'this night saved: "Saved"');
  await syncNow(); // this device's own night, echoed back: nothing to announce
  assert.equal(news.length, 1);

  await tick();
  const mine = (await store.getEntry('2026-11-01'))!;
  await otherDevice({ ...mine, dream: 'from the phone', updatedAt: stamp() }); // changed there
  await otherDevice({ ...mine, nightOf: '2026-11-02', triedSleepAt: '2026-11-02T23:10:00', updatedAt: stamp() }); // new
  await syncNow();
  assert.deepEqual(news[1], { added: 1, updated: 1, saved: 0 });
  await syncNow();
  assert.equal(news.length, 2, 'once only');
});
