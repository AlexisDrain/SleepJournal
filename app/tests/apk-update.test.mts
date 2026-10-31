// The Android APK notice reads version codes from GitHub release tags, and never runs elsewhere.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installedCode, releaseCode } from '@/lib/apkUpdate';

test('only android-<number> tags are APK releases', () => {
  assert.equal(releaseCode('android-12'), 12);
  assert.equal(releaseCode('v1.2.0'), null);
  assert.equal(releaseCode('android-12-beta'), null);
  assert.equal(releaseCode(undefined), null);
});

test('off the Android APK there is nothing to check', () => {
  assert.equal(installedCode(), null);
});
