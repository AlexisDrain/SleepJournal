// The status line counts nights not yet in the Google Sheet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitingLabel } from '@/components/SyncLine';

test('waiting nights read naturally', () => {
  assert.equal(waitingLabel(1), '1 night waiting to sync');
  assert.equal(waitingLabel(3), '3 nights waiting to sync');
});
