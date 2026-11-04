// The day the Anytime list shows next to each night: today on the current night, and never the
// same day on two nights, whatever the hour.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anytimeDay } from '@/lib/journal';
import { addDays, currentNight, toDateString } from '@/lib/time';

test('Monday evening: each night shows the day it starts on', () => {
  const now = new Date(2026, 10, 2, 20, 16); // Monday Nov 2, 8:16 PM
  assert.equal(anytimeDay('2026-11-01', now), '2026-11-01');
  assert.equal(anytimeDay('2026-11-02', now), '2026-11-02', 'the current night: today');
  assert.equal(anytimeDay('2026-11-03', now), '2026-11-03');
});

test('Tuesday morning: each night shows the day it ends on', () => {
  const now = new Date(2026, 10, 3, 9, 0); // Tuesday Nov 3, 9 AM, still Monday night
  assert.equal(anytimeDay('2026-11-01', now), '2026-11-02');
  assert.equal(anytimeDay('2026-11-02', now), '2026-11-03', 'the current night: today');
  assert.equal(anytimeDay('2026-11-03', now), '2026-11-04');
});

test('at every hour: the current night shows today, and no day is shown twice or skipped', () => {
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 59]) {
      const now = new Date(2026, 10, 2, h, m);
      assert.equal(anytimeDay(currentNight(now), now), toDateString(now), `${h}:${m}`);
      const nights = Array.from({ length: 10 }, (_, i) => addDays('2026-10-28', i));
      const days = nights.map((n) => anytimeDay(n, now));
      for (let i = 1; i < days.length; i++) assert.equal(days[i], addDays(days[i - 1], 1), `${h}:${m}`);
    }
  }
});
