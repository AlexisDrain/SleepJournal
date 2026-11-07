// The App Store screenshots: the app between an iPhone's status bar (drawn later, frame.py) and
// home bar, at 393 × 759 points (3×). Needs a fresh profile with demo.csv imported (load.mjs).
// The read-only shots come first; the last one fills in a bedtime, so a second run needs a fresh
// profile again. `node shoot.mjs 03` takes just one.
import { connect } from './cdp.mjs';
const b = await connect();
const W = 393, H = 852 - 59 - 34; // the status bar (59 points) and home bar (34) are added afterwards
await b.viewport(W, H, 3);
const home = process.env.APP ?? 'http://localhost:8095';
const shot = async (name) => { await b.sleep(600); await b.shot(`raw/${name}.png`); console.log('shot', name); };
// Scrolls the page so the text (a heading, a label) sits `gap` points from the top.
const scrollTo = (text, gap = 16) => b.ev(`(() => {
  const want = ${JSON.stringify(text.toLowerCase())};
  const s = [...document.querySelectorAll('body *')].find((d) => d.innerText?.trim().toLowerCase() === want && d.getBoundingClientRect().height > 0 && ![...d.children].some((c) => c.innerText?.trim().toLowerCase() === want));
  if (!s) throw new Error('Not found: ' + want);
  let p = s.parentElement;
  while (p && !(p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
  if (p) p.scrollTop += s.getBoundingClientRect().top - p.getBoundingClientRect().top - ${gap};
})()`).then(() => b.sleep(500));
// Midday on Nov 6: the night shown everywhere is the last one in demo.csv (Nov 5), all filled in.
const DAY = '2026-11-06T12:30:00';
const only = process.argv[2];
const scenes = [
  ['02-stats', async () => {
    await b.goto(`${home}/stats`, 3500);
    await b.tap('All', 1500);
    await scrollTo('7 nights', 12);
  }],
  ['03-nights', async () => {
    await b.goto(`${home}/stats`, 3500);
    await b.tap('All', 1500);
    await scrollTo('Night by night', 10);
  }],
  ['04-cbti', async () => {
    await b.goto(`${home}/stats`, 3500);
    await scrollTo('Night by night', 10);
    await b.tap('Its questions', 1500);
  }],
  ['05-routines', async () => {
    await b.goto(`${home}/routines`, 3500);
    await scrollTo('Morning', 44);
  }],
  ['06-dreams', async () => { await b.goto(`${home}/dreams`, 3500); }],
  ['07-sheet', async () => { await b.goto(`${home}/sheet`, 3500); }],
  ['08-sync', async () => {
    await b.goto(`${home}/settings`, 3500);
    await scrollTo('Google Sheet', 12);
  }],
  ['09-private', async () => {
    await b.goto(`${home}/settings`, 3500);
    await scrollTo('Your data', 12);
  }],
  ['10-light', async () => {
    await b.goto(`${home}/settings`, 3500);
    await b.tap('Light', 1200);
    await b.goto(`${home}/`, 3500);
  }],
  // This one fills in the bedtime of Nov 6, as you would that evening.
  ['01-bedtime', async () => {
    await b.goto(`${home}/settings`, 3500);
    await b.tap('Dark', 1200);
    await b.clock('2026-11-06T22:40:00');
    await b.goto(`${home}/`, 3500);
    await b.tap('Set to now', 900);
    await b.tap('e.g. must wake up at 8 am for ✈️, or leave blank', 400);
    await b.type('Read for half an hour, then lights out.', 20);
    await b.tap('exercise', 900);
    await b.ev(`document.activeElement?.blur()`);
    await scrollTo('Friday night → Saturday morning', 40);
  }],
];
for (const [name, run] of scenes) {
  if (only && !name.startsWith(only)) continue;
  // Midday on Nov 6 unless the scene sets its own hour (the check-ins do).
  try { await b.clock(DAY); await run(); await shot(name); } catch (e) { console.log('FAILED', name, e.message); }
}
b.close();
