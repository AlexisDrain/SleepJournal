// The Settings warning that a synced Google Sheet is nearing Google's 10 million cell limit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateSheetCells, SHEET_CELL_WARNING, sheetCells } from '@/db/csv';
import { store } from '@/db/store';

test('a tab counts its whole grid, empty cells too', () => {
  assert.equal(sheetCells(40, 1), 40_000);
  assert.equal(sheetCells(10, 1), 26_000, 'a new tab has at least 26 columns');
});

test('20 routine items take centuries to reach the warning', () => {
  assert.ok(sheetCells(44, 200) < SHEET_CELL_WARNING);
  assert.ok(sheetCells(44, 210) >= SHEET_CELL_WARNING);
});

test('the estimate counts each year, and a deleted item keeps its column', async () => {
  await store.saveEntry('2025-03-01', { dream: 'a' });
  await store.saveEntry('2026-03-01', { dream: 'b' });
  const before = await estimateSheetCells();
  const item = await store.routine.create({ label: 'Gone', phase: 'morning', kind: 'check' });
  const withItem = await estimateSheetCells();
  await store.routine.remove(item.id);
  assert.equal(before % 2000, 0, 'two years');
  assert.equal(await estimateSheetCells(), withItem);
});
