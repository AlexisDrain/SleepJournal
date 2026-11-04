// A sleep report to hand to someone else (a therapist, a doctor): one printable page per stretch of
// nights, with the averages, a chart of hours asleep and the night-by-night table. It is plain HTML
// that the phone or the browser turns into a PDF (see printReport). Light colours, made for paper.
import { formatAfterMidnight, formatAfterNoon, summarize } from './stats';
import { toDateString } from './time';
import type { Entry } from './types';

export interface ReportColumn<E extends Entry = Entry> {
  label: string;
  /** Numbers line up on the right. */
  right?: boolean;
  /** Free text (tags, notes): given more room, and wraps. */
  long?: boolean;
  text: (e: E) => string;
}

/** Hours asleep as a share of the time in bed, when both are known (what sleep therapists track). */
export function sleepEfficiency(e: Entry): number | null {
  const start = e.inBedAt ?? e.triedSleepAt;
  const end = e.dayStartedAt ?? e.wokeAt;
  if (!start || !end || e.hoursAsleep === null || e.hoursAsleep < 0) return null;
  const inBedMin = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  if (!(inBedMin > 0)) return null;
  const pct = Math.round((e.hoursAsleep * 60 / inBedMin) * 100);
  return pct <= 100 ? pct : null; // more asleep than in bed: the times don't add up
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const longDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};
const nightCell = (nightOf: string) => {
  const [y, m, d] = nightOf.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

/** The report's file name, without the extension. */
export const reportName = (now = new Date()) => `sleep-report-${toDateString(now)}`;

/**
 * The report as a complete HTML page. `entries` are the nights to show, oldest first; `columns` the
 * table's columns after the night (the ones ticked in Night by night).
 */
export function buildReportHtml<E extends Entry>(entries: E[], columns: ReportColumn<E>[], period: string, now = new Date()): string {
  const s = summarize(entries);
  const effs = entries.map(sleepEfficiency).filter((p): p is number => p !== null);
  const avgEff = effs.length ? Math.round(effs.reduce((a, b) => a + b, 0) / effs.length) : null;
  const range = entries.length ? `${longDate(entries[0].nightOf)} – ${longDate(entries[entries.length - 1].nightOf)}` : '';

  const tile = (label: string, value: string, note: string) =>
    `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="note">${esc(note)}</div></div>`;
  const tiles = [
    tile('Hours asleep', s.avgHours === null ? '—' : `${s.avgHours} h`, 'average'),
    tile('Sleep efficiency', avgEff === null ? '—' : `${avgEff}%`, 'asleep ÷ time in bed, average'),
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

  const showEff = effs.length > 0;
  const head = ['<th>Night</th>', ...columns.map((c) => `<th class="${c.right ? 'num' : ''}">${esc(c.label)}</th>`),
    ...(showEff ? ['<th class="num">Efficiency</th>'] : [])].join('');
  const body = entries.map((e) => {
    const cells = columns.map((c) => `<td class="${[c.right && 'num', c.long && 'long'].filter(Boolean).join(' ')}">${esc(c.text(e) || '—')}</td>`);
    const eff = sleepEfficiency(e);
    if (showEff) cells.push(`<td class="num">${eff === null ? '—' : `${eff}%`}</td>`);
    return `<tr><td class="night">${esc(nightCell(e.nightOf))}</td>${cells.join('')}</tr>`;
  }).join('\n');

  const tags = s.tags.length
    ? `<h2>Tags</h2><p>${s.tags.map((t) => `${esc(t.name)} ×${t.count}`).join(' · ')}</p>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(reportName(now))}</title>
<style>
  @page { size: landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  body { background: #fff; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1c1c28; margin: 0; padding: 16px; font-size: 11pt; }
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
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; color: #555; background: #f0f0f5; padding: 5px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #e4e4ea; vertical-align: top; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #fafafc; }
  .num { text-align: right; }
  .night { white-space: nowrap; font-weight: 600; }
  .long { min-width: 140px; white-space: pre-wrap; }
  footer { margin-top: 14px; font-size: 8pt; color: #888; }
</style></head>
<body>
<h1>Sleep diary</h1>
<p class="sub">${esc(period)}${range ? ` · ${esc(range)}` : ''}</p>
<div class="tiles">${tiles}</div>
${chart}
<h2>Night by night</h2>
${entries.length ? `<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table>` : '<p>No nights in this period.</p>'}
${tags}
<footer>Made with Sleep Journal on ${esc(longDate(toDateString(now)))}. A night runs from the evening to the next afternoon and is named by the day it starts.</footer>
</body></html>`;
}
