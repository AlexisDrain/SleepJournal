// A sync asked for while one is running: it only goes again if something changed here meanwhile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { store } from '@/db/store';
import { connect, requestSync, syncNow } from '@/db/sync';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
let pulls = 0;
(globalThis as any).fetch = async (_url: string, init: any) => {
  if (JSON.parse(init.body).action === 'pull') pulls++;
  await new Promise((r) => setTimeout(r, 30)); // slow enough to ask again while it runs
  return { text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text };
};
const settle = () => new Promise((r) => setTimeout(r, 1500));

test('two asks at once (launch, coming back to the app) make one sync', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await store.saveEntry('2026-10-20', { dream: 'first' });
  await syncNow();
  await settle();
  pulls = 0;
  const run = syncNow();
  requestSync(0);
  await run;
  await settle();
  assert.equal(pulls, 1);
});

test('an edit made during a sync still goes out', async () => {
  pulls = 0;
  const run = syncNow();
  await new Promise((r) => setTimeout(r, 200)); // past the point where the sync collects edits
  await store.saveEntry('2026-10-21', { dream: 'written during the sync' });
  requestSync(0);
  await run;
  await settle();
  assert.equal(pulls, 2);
  const tab = env.ss.getSheetByName('2026');
  const nights = tab.getRange(2, 1, tab.getLastRow() - 1, 1).getValues().map((r: any) => String(r[0]));
  assert.ok(nights.includes('2026-10-21'));
});
