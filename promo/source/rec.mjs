// Records an app preview: the app at 443 × 827 points (886 × 1654 pixels, between an iPhone's
// status bar and home bar, which are added when the video is made), with a dot showing each tap.
// Needs a fresh profile with demo.csv imported (load.mjs): `checkin` fills in the night of Nov 6.
import fs from 'node:fs';
import { connect } from './cdp.mjs';
const name = process.argv[2];
const b = await connect();
await b.viewport(443, 960 - 59 - 34, 2);
const home = process.env.APP ?? 'http://localhost:8095';
const dir = `frames/${name}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

let recording = false;
const frames = [];
b.on((m) => {
  if (m.method !== 'Page.screencastFrame') return;
  b.send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  if (!recording) return;
  const file = `${dir}/${String(frames.length).padStart(5, '0')}.jpg`;
  fs.writeFileSync(file, Buffer.from(m.params.data, 'base64'));
  frames.push({ file, t: m.params.metadata.timestamp });
});
const dot = (x, y) => b.ev(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,.45);border:2px solid rgba(255,255,255,.8);pointer-events:none;z-index:99999;transition:transform .35s,opacity .35s'; document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1.5)'; d.style.opacity = '0'; })); setTimeout(() => d.remove(), 500); })()`);
// Scrolls in small steps until the thing to tap is on screen, as a person would (no jumping to it).
async function scrollTo(q) {
  let last = null, still = 0;
  for (let i = 0; i < 60; i++) {
    const r = await b.ev(`(() => { const e = __el(${JSON.stringify(q)}); if (!e) return null; const b = e.getBoundingClientRect(); let p = e.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement; const box = p ? p.getBoundingClientRect() : { top: 0, bottom: innerHeight }; return { x: b.left + b.width / 2, top: b.top - box.top, bottom: box.bottom - b.bottom, h: innerHeight }; })()`);
    if (!r) return;
    // top / bottom: room between the button and the edges of the part that scrolls
    const dy = r.bottom < 16 ? 1 : r.top < 16 ? -1 : 0;
    still = r.top === last ? still + 1 : 0;
    if (!dy || still >= 4) return; // there, or it can't scroll any further
    last = r.top;
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.x, y: r.h * 0.6, deltaX: 0, deltaY: dy * 24 });
    await pause(16);
  }
}
async function tap(q, after = 700) {
  await scrollTo(q);
  await pause(250);
  const p = await b.center(q);
  await dot(p.x, p.y);
  await pause(150);
  for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await pause(after);
}
async function type(text, perChar) {
  for (const ch of text) { await b.send('Input.insertText', { text: ch }); await pause(perChar); }
}
const pause = (ms) => b.sleep(ms);
// Keeps the page drawing steadily, so the recording has frames even when nothing moves.
const ticker = `(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:99999'; document.body.appendChild(d); let i = 0; setInterval(() => { d.style.background = (i++ % 2) ? '#000' : '#010101'; }, 33); })()`;

// A slow scroll with the mouse wheel, like a thumb.
async function wheel(dy, steps, x = 220, y = 500, dx = 0) {
  for (let i = 0; i < steps; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy }); await pause(40); }
}
const scripts = {
  // 1. The morning check-in, then the morning routine (with the CBT-I questions)
  async checkin() {
    // Off camera: last night's bedtime, filled in that evening (or the Journal asks about it first).
    await b.clock('2026-11-06T22:40:00');
    await b.goto(`${home}/`, 3500);
    await b.tap('Set to now', 1200);
    await b.clock('2026-11-07T07:15:00');
    await b.goto(`${home}/`, 3500);
    await b.ev(ticker);
    await start();
    await pause(1500);
    await tap('Set to now', 900);
    await tap('Leave blank if you don\'t remember', 500);
    await type('A fox walked me home and asked about my week.', 38);
    await b.ev(`document.activeElement?.blur()`);
    await pause(500);
    await tap('15m', 800);
    await pause(400);
    await tap('4', 800);
    await tap('good dream', 900);
    await pause(900);
    await tap('Routines', 1600);
    await tap('Drink water', 450);
    await tap('Get some sunlight', 450);
    await tap('~Times woke in the night', 500);
    await type('1', 120);
    await tap('~Minutes awake in the night', 500);
    await type('10', 120);
    await b.ev(`document.activeElement?.blur()`);
    await pause(2200);
  },
  // 2. Stats: averages, the chart, night by night; then the dreams
  async stats() {
    await b.clock('2026-11-07T12:30:00');
    await b.goto(`${home}/stats`, 3500);
    await b.ev(ticker);
    await start();
    await pause(1200);
    await tap('All', 1300);
    await wheel(28, 22);
    await pause(1600);
    await wheel(30, 26);
    await pause(1500);
    await tap('Show more columns to the right', 1300);
    await pause(800);
    await wheel(-60, 40);
    await pause(400);
    await tap('~Dreams', 1800);
    await tap('~Read a random dream', 2600);
    await pause(800);
  },
  // 3. The spreadsheet, the Google Sheet, and the CBT-I questions in Settings
  // (no light mode here: the status bar laid over the video is white)
  async sheet() {
    await b.clock('2026-11-07T12:30:00');
    await b.goto(`${home}/stats`, 3500);
    await b.ev(ticker);
    await start();
    await pause(1000);
    await tap('~Sheet', 1600);
    await wheel(0, 14, 300, 500, 70);
    await pause(1300);
    await wheel(0, 14, 300, 500, -70);
    await pause(600);
    await tap('Settings', 1300);
    await wheel(26, 14); // the Google Sheet card
    await pause(1600);
    await wheel(40, 28); // on down toward Advanced (not past it: the Help card below shows the support email)
    await tap('Add CBT-I questions in Routines ★', 2600);
    await pause(900);
  },
};

async function start() {
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await b.sleep(300);
  recording = true;
}
await scripts[name]();
recording = false;
await b.send('Page.stopScreencast');
// ffconcat list: each frame lasts until the next one arrived
const lines = ['ffconcat version 1.0'];
frames.forEach((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  lines.push(`file '${f.file.split('/').pop()}'`, `duration ${(next - f.t).toFixed(4)}`);
});
lines.push(`file '${frames.at(-1).file.split('/').pop()}'`);
fs.writeFileSync(`${dir}/list.txt`, lines.join(String.fromCharCode(10)));
console.log(name, frames.length, 'frames', (frames.at(-1).t - frames[0].t).toFixed(1), 's');
b.close();
