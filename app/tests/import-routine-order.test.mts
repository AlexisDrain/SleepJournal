// An .xlsx saved from the Google Sheet has the routine list, in order, in its "Routine items" tab.
// Importing it brings that list in first (as connecting the sheet does), so the items keep the
// sheet's order, kinds and hidden ones, and the nights' answers land on them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { importXlsx } from '@/db/csv';
import { store } from '@/db/store';

const cell = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
const row = (n: number, values: string[]) =>
  `<row r="${n}">${values.map((v, i) => cell(String.fromCharCode(65 + i) + n, v)).join('')}</row>`;
const sheet = (rows: string[][]) =>
  strToU8(`<worksheet><sheetData>${rows.map((r, i) => row(i + 1, r)).join('')}</sheetData></worksheet>`);

test('routine items come in in the sheet’s order', async () => {
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(`<workbook><sheets><sheet name="Journal" sheetId="1" r:id="rId1"/><sheet name="Routine items" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`),
    // The nights' columns in a different order from the list.
    'xl/worksheets/sheet1.xml': sheet([
      ['Night of', 'Morning: Zebra stretch', 'Morning: Glass of water', 'Morning: Steps'],
      ['2026-02-01', 'TRUE', 'TRUE', '4200'],
    ]),
    'xl/worksheets/sheet2.xml': sheet([
      ['Id', 'Check-in', 'Item', 'Records', 'Order', 'Hidden', 'Updated'],
      ['aaa1', 'Morning', 'Glass of water', 'Check', '0', '', '2026-01-01T00:00:00Z'],
      ['aaa2', 'Morning', 'Steps', 'Number', '1', '', '2026-01-01T00:00:00Z'],
      ['aaa3', 'Morning', 'Zebra stretch', 'Check', '2', '', '2026-01-01T00:00:00Z'],
      ['aaa4', 'Morning', 'Old item', 'Check', '3', 'yes', '2026-01-01T00:00:00Z'],
    ]),
  });
  const r = await importXlsx(bytes);
  assert.equal(r.imported, 1);

  const morning = (await store.routine.list()).filter((i) => i.phase === 'morning');
  const names = ['Glass of water', 'Steps', 'Zebra stretch', 'Old item'];
  const ours = morning.filter((i) => names.includes(i.label)).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(ours.map((i) => i.label), names);
  assert.equal(ours[1].kind, 'number');
  assert.ok(ours[3].hiddenSince);
  // No copies made from the nights' columns.
  assert.equal(morning.filter((i) => i.label === 'Steps').length, 1);
});
