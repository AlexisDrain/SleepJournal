// Ticking a routine item saves a value right away, so the tick stays with its day:
// check → true, time → now, number → 0, text → "?".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { store } from '@/db/store';
import { isTicked, tickedValue, typedNumber, typedText } from '@/lib/routineTick';

test('what a tick saves, for each kind', () => {
  assert.equal(tickedValue('check', '2026-11-04', 'morning'), true);
  assert.equal(tickedValue('number', '2026-11-04', 'morning'), 0);
  assert.equal(tickedValue('text', '2026-11-04', 'morning'), '?');
});

test('a time tick is the time now, to 5 minutes, on that night', () => {
  // The night of Nov 4: the morning is Nov 5, the bedtime still Nov 4 before midnight.
  const morning = tickedValue('time', '2026-11-04', 'morning', new Date(2026, 10, 5, 7, 2)) as string;
  assert.match(morning, /^2026-11-05T07:00:00[+-]\d\d:\d\d$/);
  const bedtime = tickedValue('time', '2026-11-04', 'bedtime', new Date(2026, 10, 4, 22, 58)) as string;
  assert.match(bedtime, /^2026-11-04T23:00:00/);
  // Ticked later for an earlier night (catching up): the clock time lands on that night, not today.
  const late = tickedValue('time', '2026-11-01', 'morning', new Date(2026, 10, 5, 8, 0)) as string;
  assert.match(late, /^2026-11-02T08:00:00/);
});

test('0 and "?" count as ticked; null, false and nothing do not', () => {
  for (const v of [true, 0, '?', 'note', 3, '2026-11-05T07:00:00+00:00']) assert.equal(isTicked(v), true, String(v));
  for (const v of [null, false, undefined]) assert.equal(isTicked(v), false, String(v));
});

test('typing in a number box', () => {
  assert.equal(typedNumber('3', 0), 3);
  assert.equal(typedNumber('2,5', 0), 2.5, 'a comma decimal');
  assert.equal(typedNumber('', 4), 0, 'cleared: still ticked, at 0');
  assert.equal(typedNumber('  ', 4), 0);
  assert.equal(typedNumber('abc', 4), 4, 'unreadable: keeps the last number');
});

test('typing in a note box', () => {
  assert.equal(typedText('slept badly'), 'slept badly');
  assert.equal(typedText(''), '?', 'cleared: still ticked');
  assert.equal(typedText('   '), '?');
});

test('the empty answers are saved, and stay with their night only', async () => {
  const woke = await store.routine.create({ label: 'Times woke', phase: 'morning', kind: 'number' });
  const note = await store.routine.create({ label: 'Note', phase: 'morning', kind: 'text' });
  await store.saveEntry('2026-11-03', {
    routine: { [woke.id]: tickedValue('number', '2026-11-03', 'morning'), [note.id]: tickedValue('text', '2026-11-03', 'morning') },
  });
  const ticked = await store.getEntry('2026-11-03');
  assert.equal(ticked!.routine[woke.id], 0);
  assert.equal(ticked!.routine[note.id], '?');
  assert.ok(isTicked(ticked!.routine[woke.id]) && isTicked(ticked!.routine[note.id]));

  // The next night was never ticked.
  await store.saveEntry('2026-11-04', { bedtimeNote: 'another night' });
  const next = await store.getEntry('2026-11-04');
  assert.ok(!isTicked(next!.routine[woke.id]) && !isTicked(next!.routine[note.id]));

  // Unticking clears them.
  await store.saveEntry('2026-11-03', { routine: { [woke.id]: null, [note.id]: null } });
  const cleared = await store.getEntry('2026-11-03');
  assert.ok(!isTicked(cleared!.routine[woke.id]) && !isTicked(cleared!.routine[note.id]));
});
