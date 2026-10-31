// Web: an edit waiting to be saved when the tab closes is finished on the next launch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDb, store } from '@/db/store';
import { forgetEdits, rememberEdits, waitingEdits } from '@/lib/pendingEdits';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) },
});

test('the save is finished when the database next opens, and only once', async () => {
  rememberEdits('journal', '2026-10-05', { inBedAt: '2026-10-05T22:00:00-07:00' });
  rememberEdits('journal', '2026-10-06', { dream: 'saved in time' });
  forgetEdits('journal', '2026-10-06');
  await getDb(); // the first use after a launch
  assert.equal((await store.getEntry('2026-10-05'))?.inBedAt, '2026-10-05T22:00:00-07:00');
  assert.equal(await store.getEntry('2026-10-06'), null, 'a finished save is not repeated');
  assert.deepEqual(waitingEdits(), []);
  assert.ok((await store.unsyncedFields()).get('2026-10-05')?.includes('inBedAt'), 'and it goes to the sheet');
});
