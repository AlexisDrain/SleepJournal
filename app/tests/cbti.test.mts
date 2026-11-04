// CBT-I's two morning questions, kept as Morning routine items: Stats reads them by the items' uids,
// and hours asleep leave out the minutes awake.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { store } from '@/db/store';
import { CBTI_LABELS, NO_SOURCES, withCbti } from '@/lib/cbti';

test('answers from the chosen items; hours asleep less the time awake', async () => {
  const wakes = await store.routine.create({ label: CBTI_LABELS.wakes, phase: 'morning', kind: 'number' });
  const awake = await store.routine.create({ label: CBTI_LABELS.awake, phase: 'morning', kind: 'number' });
  await store.saveEntry('2026-10-10', {
    triedSleepAt: '2026-10-10T23:00:00', wokeAt: '2026-10-11T07:00:00',
    routine: { [wakes.id]: 2, [awake.id]: '45' },
  });
  await store.saveEntry('2026-10-11', { triedSleepAt: '2026-10-11T23:00:00', wokeAt: '2026-10-12T07:00:00' });
  const entries = await store.listEntries({ from: '2026-10-10', to: '2026-10-11' });
  const items = await store.routine.list();
  const before = entries.find((e) => e.nightOf === '2026-10-10')!.hoursAsleep!;

  const [later, first] = withCbti(entries, items, { wakes: wakes.uid, awake: awake.uid });
  assert.equal(first.wakes, 2);
  assert.equal(first.awakeMin, 45);
  assert.equal(first.hoursAsleep, Math.round((before - 0.75) * 100) / 100);
  assert.equal(later.wakes, null, 'not answered');
  assert.equal(later.hoursAsleep, entries.find((e) => e.nightOf === '2026-10-11')!.hoursAsleep, 'unchanged without an answer');

  // Renamed: still found by its uid. Not chosen: hours as they were.
  await store.routine.update(awake.id, { label: 'Awake (min)' });
  assert.equal(withCbti(entries, await store.routine.list(), { wakes: null, awake: awake.uid })[1].awakeMin, 45);
  assert.equal(withCbti(entries, items, NO_SOURCES)[1].hoursAsleep, before);
});
