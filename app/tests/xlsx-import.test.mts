// Importing .xlsx: the app's own export reads back, and so does a Google Sheet / Excel file
// (shared strings, real date and time cells, one tab per year plus tabs that aren't nights).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { buildTable, importXlsx } from '@/db/csv';
import { getDb, store } from '@/db/store';
import { buildXlsx, readXlsx } from '@/db/xlsx';

test("the app's own .xlsx export imports back", async () => {
  await store.saveEntry('2026-03-01', {
    triedSleepAt: '2026-03-01T23:30:00-08:00', wokeAt: '2026-03-02T07:15:00-08:00',
    bedtimeNote: 'Tea, then "a book" & bed', tags: ['stress', 'travel'],
  });
  const { columns, rows } = await buildTable();
  const bytes = buildXlsx('Sleep journal', columns, rows);
  assert.equal(readXlsx(bytes)[0].rows[0][0], 'Night of');

  await (await getDb()).runAsync(`DELETE FROM entries WHERE night_of = '2026-03-01'`);
  const r = await importXlsx(bytes);
  assert.equal(r.imported, 1);
  const e = (await store.getEntry('2026-03-01'))!;
  assert.equal(e.bedtimeNote, 'Tea, then "a book" & bed');
  assert.deepEqual(e.tags, ['stress', 'travel']);
  assert.equal(e.triedSleepAt?.slice(0, 16), '2026-03-01T23:30');
  assert.equal(e.wokeAt?.slice(0, 16), '2026-03-02T07:15');
});

test('a Google Sheet download: date and time cells, several tabs', async () => {
  const sheet = (rows: string) => strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`);
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(`<workbook><sheets><sheet name="2025" sheetId="1" r:id="rId1"/><sheet name="2026" sheetId="2" r:id="rId2"/><sheet name="Routine items" sheetId="3" r:id="rId3"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="/xl/worksheets/sheet3.xml"/></Relationships>`),
    'xl/sharedStrings.xml': strToU8(`<sst><si><t>Night of</t></si><si><t>Tried to sleep</t></si><si><r><t>Bedtime </t></r><r><t>note</t></r></si><si><t>fish &amp; chips</t></si></sst>`),
    // style 1: a built-in date format; style 2: a custom time format
    'xl/styles.xml': strToU8(`<styleSheet><numFmts><numFmt numFmtId="164" formatCode="h:mm AM/PM"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>`),
    'xl/worksheets/sheet1.xml': sheet(`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" s="1"><v>46012</v></c><c r="B2" s="2"><v>0.9375</v></c><c r="C2" t="s"><v>3</v></c></row>`),
    'xl/worksheets/sheet2.xml': sheet(`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>2026-01-05</t></is></c><c r="C2" t="str"><v>skipped a column</v></c></row>`),
    'xl/worksheets/sheet3.xml': sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c></row>`),
  });
  const r = await importXlsx(bytes);
  assert.equal(r.imported, 2, 'one night from each year tab; the Routine items tab is left out');
  const a = (await store.getEntry('2025-12-21'))!; // 46012 = 2025-12-21
  assert.equal(a.bedtimeNote, 'fish & chips');
  assert.equal(a.triedSleepAt?.slice(0, 16), '2025-12-21T22:30'); // 0.9375 of a day = 10:30 PM
  assert.equal((await store.getEntry('2026-01-05'))?.bedtimeNote, 'skipped a column');
});

test('not a spreadsheet', async () => {
  await assert.rejects(importXlsx(strToU8('hello')), /can't be read/);
});
