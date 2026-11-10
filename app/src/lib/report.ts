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
  text: (e: E) => string;
}

/** The Google Sheet's colors (COLORS in google-sheets/SleepJournalSync.gs): [header, cell]. */
const SHEET_COLORS: Record<ReportGroup, [string, string]> = {
  other: ['#b7e4c7', '#eaf7ef'],
  bedtime: ['#b9c4ff', '#eceffd'],
  morning: ['#ffd98a', '#fff6e0'],
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

/** The report's file name, without the extension. */
export const reportName = (now = new Date()) => `sleep-report-${toDateString(now)}`;

/**
 * The report as a complete HTML page. `entries` are the nights to show, oldest first; `columns` the
 * table's columns after the night (the ones ticked in Night by night).
 */
export function buildReportHtml<E extends Entry>(entries: E[], columns: ReportColumn<E>[], period: string, now = new Date()): string {
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
      const fill = h === null ? '#d4d4dc' : h < 0 ? '#c0392b' : '#5b5fc7';
      return `<rect x="${(i * step).toFixed(1)}" y="${(H - height).toFixed(1)}" width="${bar.toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" fill="${fill}"/>`;
    }).join('');
    const avg = s.avgHours === null ? '' : `<line x1="0" x2="${W}" y1="${(H - y(s.avgHours)).toFixed(1)}" y2="${(H - y(s.avgHours)).toFixed(1)}" stroke="#1e8449" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    chart = `<h2>Hours asleep</h2>
<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart">${bars}${avg}</svg>
<div class="axis"><span>${esc(nightCell(entries[0].nightOf))}</span><span class="avg">${s.avgHours === null ? '' : `- - average ${s.avgHours} h`}</span><span>${esc(nightCell(entries[entries.length - 1].nightOf))}</span></div>
<p class="note">Scale 0 to ${top} h. A grey stub is a night without hours asleep; red means the times don't add up.</p>`;
  }

  const groupOf = (c: ReportColumn<E>) => c.group ?? 'other';
  const head = ['<th class="g-other">Night</th>',
    ...columns.map((c) => `<th class="${[`g-${groupOf(c)}`, c.right && 'num'].filter(Boolean).join(' ')}">${esc(c.label)}</th>`)].join('');
  const body = entries.map((e) => {
    const cells = columns.map((c) => `<td class="${[`g-${groupOf(c)}`, c.right && 'num', c.long && 'long'].filter(Boolean).join(' ')}">${esc(c.text(e) || '—')}</td>`);
    return `<tr><td class="g-other night">${esc(nightCell(e.nightOf))}</td>${cells.join('')}</tr>`;
  }).join('\n');
  const groupCss = (Object.keys(SHEET_COLORS) as ReportGroup[])
    .map((g) => `  th.g-${g} { background: ${SHEET_COLORS[g][0]}; }\n  td.g-${g} { background: ${SHEET_COLORS[g][1]}; }`).join('\n');

  const tags = s.tags.length
    ? `<h2>Tags</h2><p>${s.tags.map((t) => `${esc(t.name)} ×${t.count}`).join(' · ')}</p>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(reportName(now))}</title>
<style>
  @page { size: landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  /* Keep the colors when printing (browsers leave out backgrounds unless told). */
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root { color-scheme: light; }
  body { background: #fff; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1c1c28; margin: 0; padding: 16px; font-size: 11pt; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .logo { width: 40px; height: 40px; flex: none; }
  .brand .name { font-size: 15pt; font-weight: 800; }
  .brand .name span { color: #b26a00; }
  h1 { font-size: 20pt; margin: 0; }
  h2 { font-size: 12pt; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  .sub { color: #555; margin: 4px 0 0; }
  .tiles { display: flex; gap: 8px; margin-top: 14px; }
  .tile { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; }
  .tile .label { font-size: 8pt; text-transform: uppercase; color: #666; }
  .tile .value { font-size: 16pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tile .note, .note { font-size: 8pt; color: #777; }
  .chart { width: 100%; height: 110px; display: block; border-bottom: 1px solid #ccc; }
  .axis { display: flex; justify-content: space-between; font-size: 8pt; color: #666; margin-top: 2px; }
  .axis .avg { color: #1e8449; }
  /* The table as in the Google Sheet: grid lines, bold headers, each column in its check-in's color. */
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8.5pt; font-weight: 700; color: #1c1c28; padding: 5px 6px; border: 1px solid #c8c8d2; vertical-align: bottom; }
  td { padding: 4px 6px; border: 1px solid #d6d6de; vertical-align: top; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
${groupCss}
  .num { text-align: right; }
  .night { white-space: nowrap; font-weight: 600; }
  .long { min-width: 140px; white-space: pre-wrap; }
  footer { margin-top: 14px; font-size: 8pt; color: #888; }
</style></head>
<body>
<div class="brand">${LOGO}<div class="name"><span>1-Minute</span> Sleep Journal</div></div>
<h1>Sleep diary</h1>
<p class="sub">${esc(period)}${range ? ` · ${esc(range)}` : ''}</p>
<div class="tiles">${tiles}</div>
${chart}
<h2>Night by night</h2>
${entries.length ? `<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table>` : '<p>No nights in this period.</p>'}
${tags}
<footer>Made with 1-Minute Sleep Journal on ${esc(longDate(toDateString(now)))}. A night runs from the evening to the next afternoon and is named by the day it starts.</footer>
</body></html>`;
}
