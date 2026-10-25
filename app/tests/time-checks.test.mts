// The Journal's warnings for times that can't be right.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bedtimeProblem, negativeSleep, wakeTimeProblem } from '@/lib/journal';
import { timeOnNight, toLocalIso } from '@/lib/time';

const night = '2026-10-23';
const at = (h: number, m: number, phase: 'bedtime' | 'morning') => toLocalIso(timeOnNight(night, h, m, phase));

test('the reported night: bed 10:20 AM, woke 10:40 AM, 30 min to fall asleep → −0.17 h', () => {
  const bed = at(10, 20, 'bedtime');
  const woke = at(10, 40, 'morning');
  assert.equal(negativeSleep(bed, woke, 30), -0.17);
  assert.equal(wakeTimeProblem(bed, woke), null, 'the wake time alone looks fine, so the new warning is needed');
  // and the cause: a bedtime in the morning, which should have been 10:20 PM
  assert.equal(bedtimeProblem(bed)?.fix.slice(0, 16), '2026-10-23T22:20');
});

test('a normal night has no warnings', () => {
  const bed = at(23, 30, 'bedtime');
  const woke = at(7, 15, 'morning');
  assert.equal(negativeSleep(bed, woke, 20), null);
  assert.equal(bedtimeProblem(bed), null);
});

test('late bedtimes after midnight are fine, up to 6 AM', () => {
  assert.equal(bedtimeProblem(at(1, 30, 'bedtime')), null);
  assert.equal(bedtimeProblem(at(5, 59, 'bedtime')), null);
  assert.notEqual(bedtimeProblem(at(6, 0, 'bedtime')), null);
  assert.equal(bedtimeProblem(at(15, 0, 'bedtime')), null);
});

test('missing times give no warning', () => {
  assert.equal(negativeSleep(null, at(7, 0, 'morning'), 30), null);
  assert.equal(negativeSleep(at(23, 0, 'bedtime'), null, 30), null);
  assert.equal(bedtimeProblem(null), null);
});
