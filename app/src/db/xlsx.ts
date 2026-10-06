// A tiny .xlsx writer: just enough of the Office Open XML format for one sheet with
// color-coded columns. An .xlsx file is a zip of a few XML files; fflate does the zipping.
// Opens in Google Sheets, Excel and Numbers with the colors intact.
import { strToU8, zipSync } from 'fflate';

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
