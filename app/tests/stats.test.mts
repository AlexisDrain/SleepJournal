// The Stats tab's averages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAfterMidnight, formatAfterNoon, summarize } from '@/lib/stats';
import type { Entry } from '@/lib/types';

const night = (nightOf: string, p: Partial<Entry>): Entry => ({
  id: 0, nightOf, weekday: '', inBedAt: null, triedSleepAt: null, sleepLatencyMin: null, wokeAt: null, dayStartedAt: null,
  hoursAsleep: null, wakeCount: null, rested: null, restedSkipped: false, bedtimeNote: null, morningNote: null, dream: null,
  tags: [], routine: {}, updatedAt: '', ...p,
});

test('bedtimes either side of midnight average to midnight, not noon', () => {
  const s = summarize([
    night('2026-10-01', { triedSleepAt: '2026-10-01T23:00:00-07:00' }),
    night('2026-10-02', { triedSleepAt: '2026-10-03T01:00:00-07:00' }),
  ]);
  assert.equal(formatAfterNoon(s.avgTriedMin!), '12:00 AM');
});

test('hours, start of day and tags', () => {
  const s = summarize([
    night('2026-10-01', { hoursAsleep: 7, dayStartedAt: '2026-10-02T07:30:00-07:00', tags: ['stress'] }),
    night('2026-10-02', { hoursAsleep: 8, dayStartedAt: '2026-10-03T08:30:00-07:00', tags: ['stress', 'travel'] }),
    night('2026-10-03', { hoursAsleep: -0.2 }), // an AM/PM slip: left out of the average
  ]);
  assert.equal(s.nights, 3);
  assert.equal(s.avgHours, 7.5);
  assert.equal(formatAfterMidnight(s.avgStartedMin!), '8:00 AM');
  assert.deepEqual(s.tags, [{ name: 'stress', count: 2 }, { name: 'travel', count: 1 }]);
});

test('an empty list gives no averages', () => {
  const s = summarize([]);
  assert.equal(s.avgHours, null);
  assert.equal(s.avgTriedMin, null);
  assert.equal(s.avgStartedMin, null);
});
