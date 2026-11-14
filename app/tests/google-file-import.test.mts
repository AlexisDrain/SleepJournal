// Picking a Google Sheet for Import: it isn't a file (Android gives its Google type; iPhone and the web
// get a .gsheet shortcut that only links to it), so the app explains how to bring it in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOOGLE_FILE_MESSAGE, isGoogleFile } from '@/db/csv';

test('Google documents are told apart from real files', () => {
  assert.equal(isGoogleFile('application/vnd.google-apps.spreadsheet'), true, 'Android: by its type');
  assert.equal(isGoogleFile('application/vnd.google-apps.document'), true);
  assert.equal(isGoogleFile(null, 'My sleep journal.gsheet'), true, 'iPhone / web: the shortcut file');
  assert.equal(isGoogleFile('application/octet-stream', 'Notes.gdoc'), true);
  assert.equal(isGoogleFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'journal.xlsx'), false, 'a downloaded .xlsx');
  assert.equal(isGoogleFile('text/csv', 'sheet-export.csv'), false);
  assert.equal(isGoogleFile(undefined, 'gsheet.csv'), false, 'only the ending counts');
  assert.equal(isGoogleFile(undefined, undefined), false);
});

test('the message says how to bring it in (here as on an iPhone: the tests run as iOS)', () => {
  assert.match(GOOGLE_FILE_MESSAGE, /Settings → Google Sheet/);
  assert.match(GOOGLE_FILE_MESSAGE, /Send a copy → Excel/);
});

test('a file is read by what it is, not its name: .xlsx (zip), PDF, or else CSV text', async () => {
  const { fileKind, PDF_MESSAGE } = await import('@/db/csv');
  const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  assert.equal(fileKind(bytes('PK\u0003\u0004…')), 'xlsx', 'an .xlsx, even if named otherwise');
  assert.equal(fileKind(bytes('%PDF-1.7')), 'pdf', 'a PDF (what Drive gives for a Google Sheet)');
  assert.equal(fileKind(bytes('Night of,Day,Hours asleep')), 'text', 'a CSV');
  assert.equal(fileKind(new Uint8Array()), 'text', 'empty');
  assert.match(PDF_MESSAGE, /PDF/);
});
