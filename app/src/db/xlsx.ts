// A tiny .xlsx writer (and reader, below): just enough of the Office Open XML format for one sheet with
// color-coded columns. An .xlsx file is a zip of a few XML files; fflate does the zipping.
// Opens in Google Sheets, Excel and Numbers with the colors intact.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type ColumnGroup = 'other' | 'bedtime' | 'morning';
export interface SheetColumn { header: string; group: ColumnGroup; width: number }
export type SheetValue = string | number | null | undefined;

// [header fill, body fill] per group, as ARGB hex
const COLORS: Record<ColumnGroup, [string, string]> = {
  other: ['FFB7E4C7', 'FFEAF7EF'],   // green
  bedtime: ['FFB9C4FF', 'FFECEFFF'], // blue
  morning: ['FFFFD98A', 'FFFFF6E0'], // yellow
};
const GROUPS: ColumnGroup[] = ['other', 'bedtime', 'morning'];
// Style ids in styles.xml: 0 = default, then header styles 1-3, body styles 4-6 (in GROUPS order).
const headerStyle = (g: ColumnGroup) => 1 + GROUPS.indexOf(g);
const bodyStyle = (g: ColumnGroup) => 4 + GROUPS.indexOf(g);

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    // XML 1.0 forbids most control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 0 → A, 25 → Z, 26 → AA */
function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cellXml(ref: string, v: SheetValue, style: number): string {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function stylesXml(): string {
  const fills = GROUPS.flatMap((g) => COLORS[g]).map(
    (argb) => `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`,
  );
  const xf = (font: number, fill: number, border: number, align = '') =>
    `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" applyFont="1" applyFill="1" applyBorder="1"${align ? ' applyAlignment="1"' : ''}>${align}</xf>`;
  const wrapTop = '<alignment vertical="top" wrapText="1"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="${2 + fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.join('')}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${GROUPS.map((_, i) => xf(1, 2 + i * 2, 1, wrapTop)).join('\n')}
${GROUPS.map((_, i) => xf(0, 3 + i * 2, 0, '<alignment vertical="top"/>')).join('\n')}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function sheetXml(columns: SheetColumn[], rows: SheetValue[][]): string {
  const header = `<row r="1">${columns.map((c, i) => cellXml(`${colName(i)}1`, c.header, headerStyle(c.group))).join('')}</row>`;
  const body = rows.map(
    (row, r) =>
      `<row r="${r + 2}">${columns.map((c, i) => cellXml(`${colName(i)}${r + 2}`, row[i], bodyStyle(c.group))).join('')}</row>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${header}${body.join('')}</sheetData>
</worksheet>`;
}

/** Build the .xlsx file bytes. */
export function buildXlsx(sheetName: string, columns: SheetColumn[], rows: SheetValue[][]): Uint8Array {
  const xml = (s: string) => strToU8(s);
  return zipSync({
    '[Content_Types].xml': xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': xml(stylesXml()),
    'xl/worksheets/sheet1.xml': xml(sheetXml(columns, rows)),
  });
}

// ---------- reading ----------
// Enough to read back a journal: this app's own exports, and a Google Sheet or Excel file saved
// as .xlsx (several tabs, shared strings, real date and time cells). Every cell comes out as text,
// the way it would read in a CSV.

const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' || e[1] === 'X' ? 2 : 1), e[1] === 'x' || e[1] === 'X' ? 16 : 10))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);
const attr = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
/** All the text runs inside a string item (<si> or <is>), joined. */
const runs = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');

/** Built-in number formats that are dates or times (the rest of 0-49 are numbers, text…). */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateCode = (code: string) => /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));

/** A spreadsheet date/time number → "2026-10-23", "23:30" or "2026-10-23 23:30". */
function fromSerial(serial: number): string {
  let days = Math.floor(serial);
  let minutes = Math.round((serial - days) * 1440);
  if (minutes === 1440) (days += 1), (minutes = 0);
  const time = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  if (days === 0) return time;
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000).toISOString().slice(0, 10);
  return minutes === 0 ? date : `${date} ${time}`;
}

/** 'B' → 1, 'AA' → 26 */
const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export interface ReadSheet { name: string; rows: string[][] }

export function readXlsx(bytes: Uint8Array): ReadSheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This file can't be read as an .xlsx spreadsheet.");
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  if (!files['xl/workbook.xml']) throw new Error("This file can't be read as an .xlsx spreadsheet.");

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));

  // Which cell styles show a date or time.
  const styles = text('xl/styles.xml');
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), unesc(attr(m[0], 'formatCode') ?? '')]));
  const xfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const dateStyle = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], 'numFmtId') ?? 0);
    return DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(custom.get(id)!));
  });

  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target') ?? '']));
  return [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const target = rels.get(attr(m[0], 'r:id')) ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const rows: string[][] = [];
    for (const row of text(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      let next = 0;
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r');
        const at = ref ? colIndex(ref.replace(/\d+/g, '')) : next;
        next = at + 1;
        const body = c[2] ?? '';
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const type = attr(c[1], 't');
        let value = '';
        if (type === 's') value = v === undefined ? '' : shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = runs(body);
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'str' || type === 'e') value = unesc(v ?? '');
        else if (v !== undefined) {
          const n = Number(v);
          value = dateStyle[Number(attr(c[1], 's') ?? 0)] ? fromSerial(n) : String(Number(n.toPrecision(12)));
        }
        cells[at] = value;
      }
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    return { name: unesc(attr(m[0], 'name') ?? ''), rows: rows.filter((r) => r.some((x) => x.trim() !== '')) };
  });
}
