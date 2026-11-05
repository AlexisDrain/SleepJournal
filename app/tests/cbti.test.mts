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

test('another device knows the questions by their names, then by uid', async () => {
  const { findCbtiSources } = await import('@/lib/cbti');
  for (const i of await store.routine.list()) await store.routine.update(i.id, { label: `old ${i.id}` }); // the first test's
  // As if synced from the device that added them: this one was never told which they are.
  const wakes = await store.routine.create({ label: CBTI_LABELS.wakes, phase: 'morning', kind: 'number' });
  await store.routine.create({ label: CBTI_LABELS.wakes, phase: 'bedtime', kind: 'number' }); // not Morning
  let items = await store.routine.list();
  const found = findCbtiSources(items, NO_SOURCES);
  assert.equal(found.wakes, wakes.uid);
  assert.equal(found.awake, null, 'not added yet');
  // Renamed later: the remembered uid still finds it.
  await store.routine.update(wakes.id, { label: 'Woke (times)' });
  items = await store.routine.list();
  assert.equal(findCbtiSources(items, found).wakes, wakes.uid);
});

test('a question renamed before another device saw it: still known there, by its uid', async () => {
  const { addCbtiQuestion, findCbtiSources } = await import('@/lib/cbti');
  const s = await addCbtiQuestion('awake');
  assert.match(s.awake!, /^cbti-awake-/);
  const item = (await store.routine.list()).find((i) => i.uid === s.awake)!;
  await store.routine.update(item.id, { label: 'Awake overnight (min)' });
  // The other device: nothing remembered, and the name no longer matches.
  assert.equal(findCbtiSources(await store.routine.list(), NO_SOURCES).awake, s.awake);
});

test('the Settings switch adds both, and hides both again', async () => {
  const { cbtiShown, resolveCbtiSources, setCbtiQuestions } = await import('@/lib/cbti');
  await setCbtiQuestions(true);
  let items = await store.routine.list();
  let s = await resolveCbtiSources(items);
  assert.ok(cbtiShown(items, s, 'wakes') && cbtiShown(items, s, 'awake'));
  const kinds = items.filter((i) => i.uid === s.wakes || i.uid === s.awake).map((i) => `${i.phase}/${i.kind}`);
  assert.deepEqual(kinds, ['morning/number', 'morning/number']);
  await setCbtiQuestions(false);
  items = await store.routine.list();
  s = await resolveCbtiSources(items);
  assert.ok(!cbtiShown(items, s, 'wakes') && !cbtiShown(items, s, 'awake'));
  await setCbtiQuestions(true); // the same items come back, not new ones
  assert.equal((await store.routine.list()).length, items.length);
});
