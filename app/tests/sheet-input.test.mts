// Reading rows back from the Google Sheet (or a CSV): whatever someone does to the sheet, it must
// never wipe what's on the device. Missing columns and unreadable cells leave the field alone;
// only an empty cell clears it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rowToPatch } from '@/db/csv';

const header = ['Night of', 'In bed', 'Woke up', 'Rested (1-5)', 'Minutes to fall asleep', 'Tags', 'Dream'];

test('a normal row is read as usual', () => {
  const p = rowToPatch(header, ['10-1-2026', '11:30 PM', '7:15 AM', '4', '15', 'stress + travel', 'flying'], '2026-10-01', []);
  assert.equal(p.inBedAt?.slice(0, 16), '2026-10-01T23:30');
  assert.equal(p.wokeAt?.slice(0, 16), '2026-10-02T07:15');
  assert.equal(p.rested, 4);
  assert.equal(p.sleepLatencyMin, 15);
  assert.deepEqual(p.tags, ['stress', 'travel']);
  assert.equal(p.dream, 'flying');
});

test('24-hour times are read too', () => {
  const p = rowToPatch(header, ['10-1-2026', '23:30', '07:15', '', '', '', ''], '2026-10-01', []);
  assert.equal(p.inBedAt?.slice(0, 16), '2026-10-01T23:30');
  assert.equal(p.wokeAt?.slice(0, 16), '2026-10-02T07:15');
});

test('text typed into a time or number cell leaves the field alone', () => {
  const p = rowToPatch(header, ['10-1-2026', 'around midnight', 'late', 'great!', 'a while', '', ''], '2026-10-01', []);
  assert.equal(p.inBedAt, undefined);
  assert.equal(p.wokeAt, undefined);
  assert.equal(p.rested, undefined);
  assert.equal(p.sleepLatencyMin, undefined);
});

test('a rested value outside 1-5 leaves the field alone', () => {
  assert.equal(rowToPatch(header, ['10-1-2026', '', '', '9', '', '', ''], '2026-10-01', []).rested, undefined);
});

test('a deleted or renamed column leaves its field alone', () => {
  const p = rowToPatch(['Night of', 'Wake time (renamed)'], ['10-1-2026', '7:15 AM'], '2026-10-01', []);
  for (const key of ['inBedAt', 'wokeAt', 'rested', 'tags', 'dream', 'bedtimeNote'] as const) assert.equal(p[key], undefined, key);
});

test('an empty cell clears the field', () => {
  const p = rowToPatch(header, ['10-1-2026', '', '', '', '', '', ''], '2026-10-01', []);
  assert.equal(p.inBedAt, null);
  assert.equal(p.wokeAt, null);
  assert.equal(p.rested, null);
  assert.equal(p.dream, null);
  assert.deepEqual(p.tags, []);
});

test('columns in a different order are read by their names', () => {
  const p = rowToPatch(['Dream', 'Woke up', 'Night of'], ['flying', '7:15 AM', '10-1-2026'], '2026-10-01', []);
  assert.equal(p.dream, 'flying');
  assert.equal(p.wokeAt?.slice(0, 16), '2026-10-02T07:15');
});
