// A routine item whose type is changed after it has answers: what it held before is kept as it is
// in the spreadsheet, not turned into a garbled time ("12:NaN AM").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sheetPayload } from '@/db/csv';
import { store } from '@/db/store';

test('a note in an item changed to "time" goes to the sheet as the note', async () => {
  const item = await store.routine.create({ label: 'How it went', phase: 'morning', kind: 'text' });
  await store.saveEntry('2026-11-03', { routine: { [item.id]: 'slept badly' } });
  await store.saveEntry('2026-11-04', { routine: { [item.id]: '2026-11-05T07:30:00' } });
  await store.routine.update(item.id, { kind: 'time' });
  const entries = await store.listEntries({ from: '2026-11-03', to: '2026-11-04' });
  const { rows } = await sheetPayload(entries);
  const cell = (night: string) => rows.find((r) => r.nightOf === night)!.values['Morning: How it went'];
  assert.equal(cell('2026-11-03'), 'slept badly');
  assert.match(String(cell('2026-11-04')), /^7:30\s?AM$|^07:30$/);
});

test('the count of answered nights that fixes an item\'s type', async () => {
  const item = await store.routine.create({ label: 'Glasses of water', phase: 'morning', kind: 'number' });
  assert.equal(await store.routine.answeredNights(item.id), 0, 'new: the type can still change');
  await store.saveEntry('2026-11-01', { routine: { [item.id]: 2 } });
  await store.saveEntry('2026-11-02', { routine: { [item.id]: 0 } }); // ticked, nothing typed: still an answer
  assert.equal(await store.routine.answeredNights(item.id), 2);
  await store.saveEntry('2026-11-02', { routine: { [item.id]: null } }); // unticked
  assert.equal(await store.routine.answeredNights(item.id), 1);
});
