// Text people really type: emoji, other scripts, line breaks, things that look like formulas or
// numbers, very long dreams, many routine items with long names. All of it has to reach the sheet,
// come back from it, and go into an .xlsx file unharmed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { buildTable } from '@/db/csv';
import { store } from '@/db/store';
import { connect, syncNow } from '@/db/sync';
import { buildXlsx, readXlsx } from '@/db/xlsx';
import { TEXT_MAX } from '@/lib/types';

const { makeEnv } = createRequire(import.meta.url)('./stubs/sheet-script.cjs');
const env = makeEnv();
env.ctx.setup();
env.ctx.showConnectionCode();
const secret = String(env.ctx.lastLog).split('\n')[1];
(globalThis as any).fetch = async (_url: string, init: any) =>
  ({ text: async () => env.ctx.doPost({ postData: { contents: init.body } }).text });
const second = () => new Promise((r) => setTimeout(r, 1100)); // times are kept to the second

const tab = () => env.ss.getSheetByName('2026');
const headers = () => tab().getRange(1, 1, 1, tab().getLastColumn()).getValues()[0] as string[];
const rowOf = (night: string) => tab().getRange(2, 1, tab().getLastRow() - 1, 1).getValues().findIndex((r: any) => r[0] === night) + 2;
const cell = (night: string, header: string) => tab().getRange(rowOf(night), headers().indexOf(header) + 1).getValues()[0][0];
/** A change typed into the sheet by hand (as another device's sync would leave it). */
function handEdit(night: string, header: string, value: string) {
  const range = tab().getRange(rowOf(night), headers().indexOf(header) + 1);
  range.setValue(value);
  env.ctx.onEdit({ range });
}

const ODD = [
  'Flew 🛩️ over 東京 with 👩🏽‍🚀 and a 🐈‍⬛',
  'café, naïve, Ångström, עברית, العربية, ไทย',
  'line one\nline two\r\nline three\ttabbed',
  '"quotes", \'apostrophes\', <tags> & ampersands',
  'zero​width and é (an accent added on)',
].join('\n');

test('emoji, other scripts and line breaks go to the sheet and back unchanged', async () => {
  await connect('https://script.google.com/macros/s/TEST/exec', secret);
  await store.saveEntry('2026-05-01', { dream: ODD, bedtimeNote: '日本語のメモ 🌙' });
  await syncNow();
  assert.equal(cell('2026-05-01', 'Dream'), ODD);
  assert.equal(cell('2026-05-01', 'Bedtime note'), '日本語のメモ 🌙');
  assert.ok(!String(cell('2026-05-01', 'Dream')).includes('�'), 'no broken characters');

  await second();
  handEdit('2026-05-01', 'Dream', ODD + '\nadded in the sheet 🌊');
  await syncNow();
  assert.equal((await store.getEntry('2026-05-01'))!.dream, ODD + '\nadded in the sheet 🌊');
});

test('text that looks like a formula, a number or a date stays text', async () => {
  const notes = ['=SUM(A1:A3)', '+1 hour', '-2', '007', '1/2', '2026-01-01', '3e5', 'TRUE', '#REF!'];
  for (const [i, note] of notes.entries()) await store.saveEntry(`2026-05-${10 + i}`, { bedtimeNote: note });
  await syncNow();
  await second();
  for (const [i, note] of notes.entries()) {
    assert.equal(cell(`2026-05-${10 + i}`, 'Bedtime note'), note, `sent as is: ${note}`);
    handEdit(`2026-05-${10 + i}`, 'Morning note', note);
  }
  await syncNow();
  for (const [i, note] of notes.entries()) {
    assert.equal((await store.getEntry(`2026-05-${10 + i}`))!.morningNote, note, `read back as is: ${note}`);
  }
});

test('a dream at the length limit, with emoji, arrives whole', async () => {
  const unit = 'A long dream 🌌 about the sea. ';
  const dream = unit.repeat(Math.ceil(TEXT_MAX / unit.length)).slice(0, TEXT_MAX - 2) + '🐋';
  assert.equal(dream.length, TEXT_MAX);
  await store.saveEntry('2026-05-02', { dream });
  await syncNow();
  assert.equal(cell('2026-05-02', 'Dream'), dream);
  assert.ok(String(cell('2026-05-02', 'Dream')).length < 50_000, "within Google's cell limit");
});

test('spaces around a note in the sheet are trimmed when it comes back', async () => {
  await store.saveEntry('2026-05-03', { bedtimeNote: 'plain' });
  await syncNow();
  await second();
  await second(); // quick syncs in a row can date this device's nights a second or two ahead
  handEdit('2026-05-03', 'Bedtime note', '   padded \n');
  await syncNow();
  assert.equal((await store.getEntry('2026-05-03'))!.bedtimeNote, 'padded');
});

test('40 routine items with long, odd names: every column, tick and summary dot', async () => {
  const items = [];
  for (let i = 0; i < 40; i++) {
    const label = i === 0 ? 'Read: 10 pages' // a colon, like the column prefix
      : i === 1 ? 'Morning: not really' // looks like another check-in's prefix
      : i === 2 ? '🧘 Stretch — 5 min «gently»'
      : `Item ${i} ${'with a really long name '.repeat(3)}`.trim();
    items.push(await store.routine.create({ label, phase: 'bedtime', kind: 'check' }));
  }
  const ticks = Object.fromEntries(items.filter((_, i) => i % 2 === 0).map((it) => [it.id, true]));
  await store.saveEntry('2026-05-04', { routine: ticks });
  await syncNow();
  await second();
  await syncNow(); // a layout change goes out as a full resend

  for (const it of items) assert.ok(headers().includes(`Bedtime: ${it.label}`), `a column for ${it.label}`);
  const summary = String(cell('2026-05-04', headers().find((h) => h.startsWith('Bedtime routine'))!));
  const all = (await store.routine.list()).filter((i) => i.phase === 'bedtime').length; // the 4 starter items too
  assert.equal(summary.split(' ')[1], `20/${all}`);
  assert.equal([...summary.split(' ')[0]].length, all, 'a dot per item');
  assert.equal(cell('2026-05-04', 'Bedtime: Read: 10 pages'), 'yes');

  // A tick added in the sheet under an odd name comes back to the right item.
  await second();
  handEdit('2026-05-04', 'Bedtime: Morning: not really', 'yes');
  await syncNow();
  const e = (await store.getEntry('2026-05-04'))!;
  assert.equal(e.routine[items[1].id], true);
  const all2 = await store.routine.listAll();
  assert.ok(!all2.some((i) => i.label === 'not really'), 'not mistaken for a Morning item');
  const names = all2.map((i) => `${i.phase}: ${i.label}`);
  assert.equal(new Set(names).size, names.length, 'no duplicates made');
});

test('tags with emoji, accents and a plus sign survive the sheet', async () => {
  await store.saveEntry('2026-05-05', { tags: ['☕ coffee', 'résumé', 'c++', 'late night'] });
  await syncNow();
  await second();
  handEdit('2026-05-05', 'Dream', 'touch the row so it comes back');
  await syncNow();
  const tags = (await store.getEntry('2026-05-05'))!.tags;
  // "c++" is kept with full-width pluses (they look the same), since " + " separates tags in the sheet.
  assert.deepEqual([...tags].sort(), ['c＋＋', 'late night', 'résumé', '☕ coffee'].sort(), 'no tag split in pieces');
});

test('.xlsx: emoji kept, Excel-breaking characters dropped, an over-long cell cut to fit', async () => {
  const huge = 'x'.repeat(32_766) + '🐋' + 'tail';
  const bytes = buildXlsx('Test', [{ header: 'Dream', group: 'morning', width: 30 }],
    [[ODD], ['bell\u0007 and vertical tab\u000B gone'], [huge]]);
  const rows = readXlsx(bytes)[0].rows.slice(1); // under the header
  assert.ok(rows[0][0].includes('👩🏽‍🚀') && rows[0][0].includes('東京') && rows[0][0].includes('עברית'));
  assert.equal(rows[1][0], 'bell and vertical tab gone');
  assert.ok(rows[2][0].length <= 32_767, "within Excel's cell limit");
  assert.ok(!rows[2][0].includes('�'), 'no emoji cut in half');

  const { columns, rows: table } = await buildTable();
  assert.doesNotThrow(() => readXlsx(buildXlsx('Journal', columns, table)), 'the whole journal exports');
});
