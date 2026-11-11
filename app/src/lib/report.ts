// A sleep report to hand to someone else (a therapist, a doctor): one printable page per stretch of
// nights, with the averages, a chart of hours asleep and the night-by-night table. It is plain HTML
// that the phone or the browser turns into a PDF (see printReport). Light colors, made for paper,
// and the table colored like the Google Sheet: general columns green, bedtime blue, morning amber.
import { formatAfterMidnight, formatAfterNoon, summarize } from './stats';
import { toDateString } from './time';
import type { Entry } from './types';

/** Which check-in a column belongs to, for its color (as in the Google Sheet). */
export type ReportGroup = 'other' | 'bedtime' | 'morning';

export interface ReportColumn<E extends Entry = Entry> {
  label: string;
  /** Numbers line up on the right. */
  right?: boolean;
  /** Free text (tags, notes): given more room, and wraps. */
  long?: boolean;
  /** Its color; general (green) if not given. */
  group?: ReportGroup;
  /** A CBT-I question: marked ★, with a line under the table saying what that means. */
  cbti?: boolean;
  text: (e: E) => string;
}

/** What the ★ means, under the table. */
const CBTI_NOTE = '★ The two questions from the CBT-I sleep diary (therapy for insomnia). Hours asleep leave out the time awake.';

/** Light (for paper) or dark (like the app at night). */
export type ReportTheme = 'light' | 'dark';

/**
 * Each theme's colors. Light: the Google Sheet's (COLORS in google-sheets/SleepJournalSync.gs).
 * Dark: the app's own dark ones, as in its Sheet tab (tints in lib/theme.ts). sheet = [header, cell].
 */
const PALETTES: Record<ReportTheme, Record<'scheme' | 'page' | 'text' | 'heading' | 'muted' | 'faint' | 'footer' | 'line' | 'axis' | 'grid' | 'cellGrid' | 'amber' | 'bar' | 'stub' | 'bad' | 'avg', string> & { sheet: Record<ReportGroup, [string, string]> }> = {
  light: {
    scheme: 'light', page: '#fff', text: '#1c1c28', heading: '#555', muted: '#666', faint: '#777', footer: '#888',
    line: '#ddd', axis: '#ccc', grid: '#c8c8d2', cellGrid: '#d6d6de', amber: '#b26a00',
    bar: '#5b5fc7', stub: '#d4d4dc', bad: '#c0392b', avg: '#1e8449',
    sheet: { other: ['#b7e4c7', '#eaf7ef'], bedtime: ['#b9c4ff', '#eceffd'], morning: ['#ffd98a', '#fff6e0'] },
  },
  dark: {
    scheme: 'dark', page: '#0e1120', text: '#e8eaf6', heading: '#9aa0c8', muted: '#9aa0c8', faint: '#8a90b8', footer: '#7a80a8',
    line: '#2a2f55', axis: '#2a2f55', grid: '#343a66', cellGrid: '#2a2f55', amber: '#ffc47a',
    bar: '#9fa8ff', stub: '#3a3f66', bad: '#ff7b7b', avg: '#6fd59a',
    sheet: { other: ['#1f3d30', '#14211b'], bedtime: ['#2a3170', '#171b38'], morning: ['#57431d', '#231d12'] },
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const longDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};
const nightCell = (nightOf: string) => {
  const [y, m, d] = nightOf.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

/** The app's icon (a crescent moon and stars on navy), drawn inline so the page needs no files. */
const LOGO = `<svg class="logo" viewBox="0 0 120 120" aria-hidden="true">
<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2150"/><stop offset="1" stop-color="#0e1120"/></linearGradient></defs>
<rect width="120" height="120" rx="27" fill="url(#lg)"/>
<path d="M66 26a36 36 0 1 0 26 58A31 31 0 0 1 66 26Z" fill="#9fa8ff"/>
<path d="M84 30l2.5 6.5 6.5 2.5-6.5 2.5-2.5 6.5-2.5-6.5-6.5-2.5 6.5-2.5z" fill="#ffc47a"/>
<path d="M95 52l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#ffc47a"/>
</svg>`;

/** The .html file: one long page that fits any screen. */
const SCREEN_CSS = `
  body { max-width: 1200px; margin: 0 auto; font-size: 15px; }
  .tiles { flex-wrap: wrap; }
  .tile { flex: 1 1 140px; }
  .scroll { overflow-x: auto; }
  table { font-size: 14px; }
  .long { min-width: 180px; }
  @media print { .scroll { overflow: visible; } }`;

/** The report's file name, without the extension. */
export const reportName = (now = new Date()) => `sleep-report-${toDateString(now)}`;

/**
 * How the page is laid out: `print` for the PDF (landscape pages), `screen` for the .html file, one
 * long page for any browser, phone or computer: never cut into pages, and the table scrolling
 * sideways if it's wider than the screen.
 */
export type ReportLayout = 'print' | 'screen';

/** The .html report's file name (the same name as the PDF's, with its own extension). */
export const reportFileName = (layout: ReportLayout, now = new Date()) => `${reportName(now)}.${layout === 'screen' ? 'html' : 'pdf'}`;

/**
 * The report as a complete HTML page. `entries` are the nights to show, oldest first; `columns` the
 * table's columns after the night (the ones ticked in Night by night).
 */
export function buildReportHtml<E extends Entry>(
  entries: E[], columns: ReportColumn<E>[], period: string, now = new Date(), layout: ReportLayout = 'print', theme: ReportTheme = 'light',
): string {
  const P = PALETTES[theme];
  const s = summarize(entries);
  const range = entries.length ? `${longDate(entries[0].nightOf)} – ${longDate(entries[entries.length - 1].nightOf)}` : '';

  const tile = (label: string, value: string, note: string) =>
    `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="note">${esc(note)}</div></div>`;
  const tiles = [
    tile('Hours asleep', s.avgHours === null ? '—' : `${s.avgHours} h`, 'average'),
    tile('Tried to sleep', s.avgTriedMin === null ? '—' : formatAfterNoon(s.avgTriedMin), 'average'),
    tile('Started day', s.avgStartedMin === null ? '—' : formatAfterMidnight(s.avgStartedMin), 'average'),
    tile('Nights', String(s.nights), 'recorded'),
  ].join('');

  // One bar per night, oldest on the left, with a line at the average.
  const hours = entries.map((e) => e.hoursAsleep);
  const known = hours.filter((h): h is number => h !== null && h > 0);
  let chart = '';
  if (known.length >= 2) {
    const W = 1000, H = 140, top = Math.max(10, Math.ceil(Math.max(...known)));
    const step = W / hours.length, bar = Math.max(1, step - 2);
    const y = (h: number) => (Math.max(0, h) / top) * H;
    const bars = hours.map((h, i) => {
      const height = h === null ? 2 : Math.max(2, y(h));
      const fill = h === null ? P.stub : h < 0 ? P.bad : P.bar;
      return `<rect x="${(i * step).toFixed(1)}" y="${(H - height).toFixed(1)}" width="${bar.toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" fill="${fill}"/>`;
    }).join('');
    const avg = s.avgHours === null ? '' : `<line x1="0" x2="${W}" y1="${(H - y(s.avgHours)).toFixed(1)}" y2="${(H - y(s.avgHours)).toFixed(1)}" stroke="${P.avg}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    chart = `<h2>Hours asleep</h2>
<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart">${bars}${avg}</svg>
<div class="axis"><span>${esc(nightCell(entries[0].nightOf))}</span><span class="avg">${s.avgHours === null ? '' : `- - average ${s.avgHours} h`}</span><span>${esc(nightCell(entries[entries.length - 1].nightOf))}</span></div>
<p class="note">Scale 0 to ${top} h. A grey stub is a night without hours asleep; red means the times don't add up.</p>`;
  }

  const groupOf = (c: ReportColumn<E>) => c.group ?? 'other';
  const head = ['<th class="g-other">Night</th>',
    ...columns.map((c) => `<th class="${[`g-${groupOf(c)}`, c.right && 'num'].filter(Boolean).join(' ')}">${c.cbti ? '<span class="star">★</span> ' : ''}${esc(c.label)}</th>`)].join('');
  const cbtiNote = columns.some((c) => c.cbti) ? `<p class="note cbti">${esc(CBTI_NOTE)}</p>` : '';
  const body = entries.map((e) => {
    const cells = columns.map((c) => `<td class="${[`g-${groupOf(c)}`, c.right && 'num', c.long && 'long'].filter(Boolean).join(' ')}">${esc(c.text(e) || '—')}</td>`);
    return `<tr><td class="g-other night">${esc(nightCell(e.nightOf))}</td>${cells.join('')}</tr>`;
  }).join('\n');
  const groupCss = (Object.keys(P.sheet) as ReportGroup[])
    .map((g) => `  th.g-${g} { background: ${P.sheet[g][0]}; }\n  td.g-${g} { background: ${P.sheet[g][1]}; }`).join('\n');

  const tags = s.tags.length
    ? `<h2>Tags</h2><p>${s.tags.map((t) => `${esc(t.name)} ×${t.count}`).join(' · ')}</p>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(reportName(now))}</title>
<style>
${layout === 'print' ? '  @page { size: landscape; margin: 12mm; }' : ''}
  * { box-sizing: border-box; }
  /* Keep the colors when printing (browsers leave out backgrounds unless told). */
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root { color-scheme: ${P.scheme}; }
  body { background: ${P.page}; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: ${P.text}; margin: 0; padding: 16px; font-size: 11pt; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .logo { width: 40px; height: 40px; flex: none; }
  .brand .name { font-size: 15pt; font-weight: 800; }
  .brand .name span { color: ${P.amber}; }
  h1 { font-size: 20pt; margin: 0; }
  h2 { font-size: 12pt; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: ${P.heading}; }
  .sub { color: ${P.heading}; margin: 4px 0 0; }
  .tiles { display: flex; gap: 8px; margin-top: 14px; }
  .tile { flex: 1; border: 1px solid ${P.line}; border-radius: 8px; padding: 8px 10px; }
  .tile .label { font-size: 8pt; text-transform: uppercase; color: ${P.muted}; }
  .tile .value { font-size: 16pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tile .note, .note { font-size: 8pt; color: ${P.faint}; }
  .chart { width: 100%; height: 110px; display: block; border-bottom: 1px solid ${P.axis}; }
  .axis { display: flex; justify-content: space-between; font-size: 8pt; color: ${P.muted}; margin-top: 2px; }
  .axis .avg { color: ${P.avg}; }
  /* The table as in the Google Sheet: grid lines, bold headers, each column in its check-in's color. */
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8.5pt; font-weight: 700; color: ${P.text}; padding: 5px 6px; border: 1px solid ${P.grid}; vertical-align: bottom; }
  td { padding: 4px 6px; border: 1px solid ${P.cellGrid}; vertical-align: top; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
${groupCss}
  .num { text-align: right; }
  .star { color: ${P.amber}; }
  .note.cbti { margin-top: 6px; }
  .night { white-space: nowrap; font-weight: 600; }
  .long { min-width: 140px; white-space: pre-wrap; }
  footer { margin-top: 14px; font-size: 8pt; color: ${P.footer}; }
${layout === 'screen' ? SCREEN_CSS : ''}
</style></head>
<body>
<div class="brand">${LOGO}<div class="name"><span>1-Minute</span> Sleep Journal</div></div>
<h1>Sleep diary</h1>
<p class="sub">${esc(period)}${range ? ` · ${esc(range)}` : ''}</p>
<div class="tiles">${tiles}</div>
${chart}
<h2>Night by night</h2>
${entries.length ? `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table></div>${cbtiNote}` : '<p>No nights in this period.</p>'}
${tags}
<footer>Made with 1-Minute Sleep Journal on ${esc(longDate(toDateString(now)))}. A night runs from the evening to the next afternoon and is named by the day it starts.</footer>
</body></html>`;
}

/**
 * The report as Markdown (.md): plain text with a table, for notes apps and anything that reads
 * Markdown. No colors and no chart: just the averages, the night-by-night table and the tags.
 */
export function buildReportMarkdown<E extends Entry>(entries: E[], columns: ReportColumn<E>[], period: string, now = new Date()): string {
  const s = summarize(entries);
  // A cell can't hold a "|" or a line break: they'd end the cell or the row.
  const cell = (t: string) => (t || '—').replace(/\|/g, '\|').replace(/\s*\n\s*/g, ' ');
  const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
  const range = entries.length ? ` · ${longDate(entries[0].nightOf)} – ${longDate(entries[entries.length - 1].nightOf)}` : '';
  const lines = [
    '# Sleep diary',
    '',
    `*1-Minute Sleep Journal* · ${period}${range}`,
    '',
    row(['Hours asleep', 'Tried to sleep', 'Started day', 'Nights']),
    row(['---', '---', '---', '---']),
    row([
      s.avgHours === null ? '—' : `${s.avgHours} h (average)`,
      s.avgTriedMin === null ? '—' : `${formatAfterNoon(s.avgTriedMin)} (average)`,
      s.avgStartedMin === null ? '—' : `${formatAfterMidnight(s.avgStartedMin)} (average)`,
      String(s.nights),
    ]),
    '',
    '## Night by night',
    '',
  ];
  if (entries.length) {
    lines.push(row(['Night', ...columns.map((c) => (c.cbti ? `★ ${c.label}` : c.label))]));
    lines.push(row(['---', ...columns.map((c) => (c.right ? '---:' : '---'))]));
    for (const e of entries) lines.push(row([nightCell(e.nightOf), ...columns.map((c) => c.text(e))]));
    if (columns.some((c) => c.cbti)) lines.push('', `*${CBTI_NOTE}*`);
  } else lines.push('No nights in this period.');
  if (s.tags.length) lines.push('', '## Tags', '', s.tags.map((t) => `${t.name} ×${t.count}`).join(' · '));
  lines.push('', `*Made with 1-Minute Sleep Journal on ${longDate(toDateString(now))}. A night runs from the evening to the next afternoon and is named by the day it starts.*`, '');
  return lines.join('\n');
}
