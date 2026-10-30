// Settings → Advanced: what "hours asleep" runs from and to.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sheetPayload } from '@/db/csv';
import { store } from '@/db/store';
import { setHoursMethod } from '@/lib/advanced';

test('the four ways of counting, each less the time to fall asleep', async () => {
  await store.saveEntry('2026-10-01', {
    inBedAt: '2026-10-01T22:00:00-07:00', triedSleepAt: '2026-10-01T23:00:00-07:00', sleepLatencyMin: 30,
    wokeAt: '2026-10-02T07:00:00-07:00', dayStartedAt: '2026-10-02T08:00:00-07:00',
  });
  const hours = async () => (await store.getEntry('2026-10-01'))!.hoursAsleep;
  assert.equal(await hours(), 7.5);
  await setHoursMethod('tried-started');
  assert.equal(await hours(), 8.5);
  await setHoursMethod('bed-woke');
  assert.equal(await hours(), 8.5);
  await setHoursMethod('bed-started');
  assert.equal(await hours(), 9.5);
  const sent = await sheetPayload([(await store.getEntry('2026-10-01'))!]);
  assert.equal(sent.rows[0].values['Hours asleep'], 7.5, 'the sheet keeps one count, whatever a device shows');

  await store.saveEntry('2026-10-02', { triedSleepAt: '2026-10-02T23:00:00-07:00', wokeAt: '2026-10-03T07:00:00-07:00' });
  assert.equal((await store.getEntry('2026-10-02'))!.hoursAsleep, null, 'no "got in bed" or "started the day": no number');
  await setHoursMethod('tried-woke');
  assert.equal((await store.getEntry('2026-10-02'))!.hoursAsleep, 8);
});
