// The PDF report: the nights in order, the chosen columns, sleep efficiency, and nothing private
// that wasn't asked for (dreams).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { store } from '@/db/store';
import { buildReportHtml, sleepEfficiency, type ReportColumn } from '@/lib/report';

test('the report: nights oldest first, chosen columns only, efficiency, text escaped', async () => {
  await store.saveEntry('2026-10-05', {
    inBedAt: '2026-10-05T23:00:00', triedSleepAt: '2026-10-05T23:00:00', wokeAt: '2026-10-06T07:00:00',
    bedtimeNote: 'tea <b>& a book</b>', dream: 'a private dream',
  });
  await store.saveEntry('2026-10-06', { bedtimeNote: 'second night' });
  const newestFirst = await store.listEntries({ from: '2026-10-05', to: '2026-10-06' });
  const entries = [...newestFirst].reverse();
  const first = entries[0];
  assert.ok(first.hoursAsleep !== null && first.hoursAsleep > 0, 'hours worked out from the times');
  const eff = sleepEfficiency(first)!;
  assert.ok(eff > 0 && eff <= 100);
  assert.equal(sleepEfficiency(entries[1]), null, 'no times: no efficiency');

  const cols: ReportColumn[] = [{ label: 'Notes', long: true, text: (e) => e.bedtimeNote ?? '' }];
  const html = buildReportHtml(entries, cols, 'Last 30 nights', new Date(2026, 10, 2));
  assert.ok(html.indexOf('second night') > html.indexOf('tea'), 'oldest first');
  assert.ok(html.includes('tea &#60;b&#62;&#38; a book&#60;/b&#62;'), 'notes escaped');
  assert.ok(!html.includes('private dream'), 'dreams stay out');
  assert.ok(html.includes(`${eff}%`) && html.includes('Last 30 nights'));
  assert.ok(html.includes('<title>sleep-report-2026-11-02</title>'));
});

test('an empty period still makes a page', () => {
  assert.ok(buildReportHtml([], [], 'All nights').includes('No nights in this period.'));
});
