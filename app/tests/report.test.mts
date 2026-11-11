// The PDF report: the nights in order, the chosen columns in the Google Sheet's colors, the app's
// name on top, and nothing private that wasn't asked for (dreams).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { store } from '@/db/store';
import { buildReportHtml, buildReportMarkdown, reportFileName, type ReportColumn } from '@/lib/report';

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

test('the .html report: one long page for any screen, never cut into pages', () => {
  const pdf = buildReportHtml([], [], 'All nights', new Date(2026, 10, 9), 'print');
  const html = buildReportHtml([], [], 'All nights', new Date(2026, 10, 9), 'screen');
  assert.ok(pdf.includes('@page { size: landscape'), 'the PDF has its pages');
  assert.ok(!html.includes('@page'), 'the .html has none');
  assert.ok(html.includes('.scroll { overflow-x: auto; }'), 'a wide table scrolls sideways');
  assert.equal(reportFileName('screen', new Date(2026, 10, 9)), 'sleep-report-2026-11-09.html');
});

test('the report as Markdown: a table, cells kept whole, no dreams', async () => {
  await store.saveEntry('2026-10-07', { bedtimeNote: 'tea | then\nbed', dream: 'another private dream' });
  const entries = [...(await store.listEntries({ from: '2026-10-07', to: '2026-10-07' }))];
  const cols: ReportColumn[] = [
    { label: 'Hours asleep', right: true, text: (e) => String(e.hoursAsleep ?? '') },
    { label: 'Notes', long: true, text: (e) => e.bedtimeNote ?? '' },
  ];
  const md = buildReportMarkdown(entries, cols, 'Last 7 nights', new Date(2026, 10, 9));
  assert.ok(md.startsWith('# Sleep diary'));
  assert.ok(md.includes('*1-Minute Sleep Journal* · Last 7 nights'));
  assert.ok(md.includes('| Night | Hours asleep | Notes |') && md.includes('| --- | ---: | --- |'), 'numbers to the right');
  assert.ok(md.includes('tea \| then bed'), 'a "|" and a line break can\'t break the table');
  assert.ok(!md.includes('private dream'), 'dreams stay out');
});

test('the dark report: the app\'s dark colors, the sheet colors as in its Sheet tab', () => {
  const dark = buildReportHtml([], [], 'All nights', new Date(2026, 10, 9), 'screen', 'dark');
  assert.ok(dark.includes('color-scheme: dark') && dark.includes('background: #0e1120'));
  assert.ok(dark.includes('th.g-bedtime { background: #2a3170; }'));
  assert.ok(buildReportHtml([], [], 'All nights').includes('color-scheme: light'), 'light unless asked');
});

test('the CBT-I questions: by their own names, marked ★, with a line saying what the ★ means', () => {
  const cols: ReportColumn[] = [
    { label: 'Times woke in the night', cbti: true, right: true, group: 'morning', text: () => '2' },
    { label: 'Notes', text: () => '' },
  ];
  const html = buildReportHtml([], cols, 'All nights');
  const htmlWith = buildReportHtml([{ nightOf: '2026-10-07', tags: [], hoursAsleep: null } as never], cols, 'All nights');
  assert.ok(htmlWith.includes('<span class="star">★</span> Times woke in the night</th>'));
  assert.ok(htmlWith.includes('The two questions from the CBT-I sleep diary'));
  assert.ok(!html.includes('CBT-I sleep diary'), 'no table, no note');
  const md = buildReportMarkdown([{ nightOf: '2026-10-07', tags: [] } as never], cols, 'All nights');
  assert.ok(md.includes('| Night | ★ Times woke in the night | Notes |') && md.includes('*★ The two questions from the CBT-I sleep diary'));
  const plain = buildReportMarkdown([{ nightOf: '2026-10-07', tags: [] } as never], [{ label: 'Notes', text: () => '' }], 'All nights');
  assert.ok(!plain.includes('★'), 'without the CBT-I columns: no ★, no note');
});
