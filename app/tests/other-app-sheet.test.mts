// A sheet made from another app's template (Recommendation Journal's looks much the same: a web
// app URL and a secret key) is turned away with a clear message, not left to fail on every sync.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { connect, disconnect, syncNow } from '@/db/sync';

const URL = 'https://script.google.com/macros/s/TEST/exec';
const KEY = 'a'.repeat(40);
const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const json = (o: object) => ({ text: async () => JSON.stringify(o) });
const page = (t: string) => ({ text: async () => t });
const setFetch = (post: (body: any) => object, get = 'Sleep Journal sync is running.') => {
  (globalThis as any).fetch = async (_url: string, init?: any) => (init?.method === 'POST' ? json(post(JSON.parse(init.body))) : page(get));
};

test("this app's own script connects: it says which app it is for", async () => {
  const env = makeEnv();
  env.ctx.setup();
  env.ctx.showConnectionCode();
  const secret = String(env.ctx.lastLog).split('\n')[1];
  let gets = 0;
  (globalThis as any).fetch = async (_url: string, init?: any) => {
    if (init?.method !== 'POST') { gets++; return page(''); }
    return { text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text };
  };
  assert.equal(typeof (await connect(URL, secret)), 'string');
  assert.equal(gets, 0, 'no need to look at its page');
  await disconnect();
});

test('a Recommendation Journal sheet is turned away when connecting', async () => {
  // Its script answers the check like this app's own (no app named), and its page says what it is.
  setFetch(() => ({ ok: true, sheet: 'Recommendations', url: 'https://docs.google.com/spreadsheets/d/x', version: 6 }),
    'Recommendation Journal sync is running.');
  await assert.rejects(connect(URL, KEY), /set up for another app, Recommendation Journal, not 1-Minute Sleep Journal/);
});

test('a script that names another app is turned away', async () => {
  setFetch(() => ({ ok: true, app: 'recommendation-journal', sheet: 'R', version: 7 }));
  await assert.rejects(connect(URL, KEY), /another app, Recommendation Journal/);
});

test("this app's older scripts (no app named) still connect", async () => {
  setFetch(() => ({ ok: true, sheet: 'My sleep', version: 7 }), 'Sleep Journal sync is running.');
  assert.equal(await connect(URL, KEY), 'My sleep');
  await disconnect();
});

test("one already connected says why its syncs fail (it doesn't know push or pull)", async () => {
  setFetch(() => ({ ok: true, sheet: 'Recommendations', version: 6 }), ''); // the page couldn't tell
  await connect(URL, KEY);
  setFetch((b) => (b.action === 'ping' ? { ok: true, sheet: 'Recommendations' } : { ok: false, error: 'Unknown action' }));
  await assert.rejects(syncNow(), /set up for another app, not 1-Minute Sleep Journal/);
  await disconnect();
});
