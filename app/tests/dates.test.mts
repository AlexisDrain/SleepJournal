// Spreadsheet dates: the chosen style for exports and CSV import, and always year-month-day in the
// Google Sheet (the sync finds nights by their date, so it must never be read two ways).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCsv, importCsvText, sheetPayload } from '@/db/csv';
import { store } from '@/db/store';
import { formatSheetDate, localePrefsReady, setDateStyle } from '@/lib/localePrefs';

const firstCell = async () => (await buildCsv()).split('\r\n')[1].split(',')[0];

test('the three styles', () => {
  assert.equal(formatSheetDate('2026-10-03', 'ymd'), '2026-10-03');
  assert.equal(formatSheetDate('2026-10-03', 'mdy'), '10-3-2026');
  assert.equal(formatSheetDate('2026-10-03', 'dmy'), '3-10-2026');
});

test('exports use the chosen style; year-month-day by default', async () => {
  await localePrefsReady;
  await store.saveEntry('2026-10-03', { bedtimeNote: 'x' });
  assert.equal(await firstCell(), '2026-10-03');
  await setDateStyle('mdy');
  assert.equal(await firstCell(), '10-3-2026');
  await setDateStyle('dmy');
  assert.equal(await firstCell(), '3-10-2026');
  await setDateStyle('ymd');
});

test('the Google Sheet always gets year-month-day, whatever the style', async () => {
  for (const style of ['ymd', 'mdy', 'dmy'] as const) {
    await setDateStyle(style);
    const payload = await sheetPayload([(await store.getEntry('2026-10-03'))!]);
    assert.equal(payload.rows[0].values['Night of'], '2026-10-03', style);
    assert.equal(payload.columns.find((c) => c.header === 'Night of')?.derived, true, 'rewritten on rows the sheet already has');
  }
  await setDateStyle('ymd');
});

test('CSV import reads the chosen two-digit style, and year-month-day always', async () => {
  await setDateStyle('dmy');
  await importCsvText('Night of,Bedtime note\r\n4-11-2026,day first\r\n2026-11-05,iso\r\n');
  assert.equal((await store.getEntry('2026-11-04'))?.bedtimeNote, 'day first', '4-11-2026 is 4 November');
  assert.equal((await store.getEntry('2026-11-05'))?.bedtimeNote, 'iso');

  await setDateStyle('mdy');
  await importCsvText('Night of,Bedtime note\r\n11-6-2026,month first\r\n');
  assert.equal((await store.getEntry('2026-11-06'))?.bedtimeNote, 'month first', '11-6-2026 is 6 November');

  await setDateStyle('ymd'); // the default still reads older month-day-year backups
  await importCsvText('Night of,Bedtime note\r\n11-7-2026,old backup\r\n');
  assert.equal((await store.getEntry('2026-11-07'))?.bedtimeNote, 'old backup');
});

test('an impossible date is skipped, not misread', async () => {
  await setDateStyle('mdy');
  const r = await importCsvText('Night of,Bedtime note\r\n23-10-2026,wrong style\r\n');
  assert.equal(r.invalid, 1);
  await setDateStyle('ymd');
});
