// The PDF report: the nights in order, the chosen columns in the Google Sheet's colors, the app's
// name on top, and nothing private that wasn't asked for (dreams).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { store } from '@/db/store';
import { buildReportHtml, type ReportColumn } from '@/lib/report';

test('the report: nights oldest first, chosen columns only, colored by check-in, text escaped', async () => {
  await store.saveEntry('2026-10-05', {
    inBedAt: '2026-10-05T23:00:00', triedSleepAt: '2026-10-05T23:00:00', wokeAt: '2026-10-06T07:00:00',
    bedtimeNote: 'tea <b>& a book</b>', dream: 'a private dream',
  });
  await store.saveEntry('2026-10-06', { bedtimeNote: 'second night' });
  const entries = [...(await store.listEntries({ from: '2026-10-05', to: '2026-10-06' }))].reverse();

  const cols: ReportColumn[] = [
    { label: 'Tried to sleep', group: 'bedtime', text: (e) => e.triedSleepAt ?? '' },
    { label: 'Notes', long: true, text: (e) => e.bedtimeNote ?? '' },
  ];
  const html = buildReportHtml(entries, cols, 'Last 30 nights', new Date(2026, 10, 2));
  assert.ok(html.indexOf('second night') > html.indexOf('tea'), 'oldest first');
  assert.ok(html.includes('tea &#60;b&#62;&#38; a book&#60;/b&#62;'), 'notes escaped');
  assert.ok(!html.includes('private dream'), 'dreams stay out');
  assert.ok(html.includes('Last 30 nights'));
  assert.ok(html.includes('<title>sleep-report-2026-11-02</title>'));
  assert.ok(html.includes('1-Minute</span> Sleep Journal') && html.includes('<svg class="logo"'), 'the app on top');
  assert.ok(!/efficiency/i.test(html), 'no sleep efficiency');
  // Colored like the Google Sheet: bedtime blue, general green (a column with no group, and Night).
  assert.ok(html.includes('<th class="g-bedtime">Tried to sleep</th>'));
  assert.ok(html.includes('<th class="g-other">Notes</th>') && html.includes('<th class="g-other">Night</th>'));
  assert.ok(html.includes('th.g-bedtime { background: #b9c4ff; }') && html.includes('td.g-morning { background: #fff6e0; }'));
  assert.ok(html.includes('print-color-adjust: exact'), 'colors kept when printed');
});

test('an empty period still makes a page', () => {
  assert.ok(buildReportHtml([], [], 'All nights').includes('No nights in this period.'));
});
