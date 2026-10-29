// Hiding a routine item takes it out of the "●●○" summary from that night on; earlier nights keep it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sheetPayload } from '@/db/csv';
import { store } from '@/db/store';
import { addDays, currentNight } from '@/lib/time';

const summaryOf = async (nightOf: string) =>
  (await sheetPayload([(await store.getEntry(nightOf))!])).rows[0].values['Bedtime routine'];

test('a hidden item keeps its dot on earlier nights only', async () => {
  const bedtime = (await store.routine.list()).filter((i) => i.phase === 'bedtime' && !i.archived);
  const all = Object.fromEntries(bedtime.map((i) => [i.id, true]));
  const before = addDays(currentNight(), -5);
  await store.saveEntry(before, { routine: all });
  await store.saveEntry(currentNight(), { routine: all });
  const n = bedtime.length;
  assert.equal(await summaryOf(before), `${'●'.repeat(n)} ${n}/${n}`);

  await store.routine.update(bedtime[0].id, { archived: true });
  assert.equal(await summaryOf(before), `${'●'.repeat(n)} ${n}/${n}`, 'an earlier night is unchanged');
  assert.equal(await summaryOf(currentNight()), `${'●'.repeat(n - 1)} ${n - 1}/${n - 1}`, 'tonight has one dot fewer');

  const note = (await sheetPayload([])).columns.find((c) => c.header === 'Bedtime routine')!.note;
  assert.match(note, new RegExp(`${bedtime[0].label} \\(before ${currentNight()}\\)`));

  await store.routine.update(bedtime[0].id, { archived: false });
  assert.equal(await summaryOf(currentNight()), `${'●'.repeat(n)} ${n}/${n}`, 'shown again: back everywhere');
  assert.equal((await store.routine.list()).find((i) => i.id === bedtime[0].id)!.hiddenSince, null);
});
