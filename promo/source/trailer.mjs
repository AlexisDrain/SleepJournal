// Records the trailer page (../trailer/index.html) as frames for a video: its 1280 × 720 stage made
// to fill the window (1920 × 1080 with Edge's 1.5 scale here), the controls hidden, from Restart to
// the end (49.5 s). trailer.sh turns the frames into the .mp4 and adds the music.
// Needs the trailer served: `python -m http.server 8097 --bind 127.0.0.1` in promo/trailer.
import fs from 'node:fs';
import { connect } from './cdp.mjs';
const LENGTH = 49.5; // SPLASH + BODY in the page
const b = await connect();
const dir = 'frames/trailer';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
await b.viewport(1280, 720, 1.5, false);
await b.goto('http://127.0.0.1:8097/index.html', 2500);
// The stage across the whole window, as in the page's own full-screen mode; no buttons or tips.
await b.ev(`(() => { const s = document.createElement('style'); s.textContent = 'body{margin:0!important;overflow:hidden!important;background:#000} .wrap{max-width:none!important;gap:0!important} .viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;aspect-ratio:auto!important;border-radius:0!important} .bar,.tip{display:none!important}'; document.head.append(s); })()`);
// Keeps the page drawing (an invisible pixel changing every frame): the screencast sends frames only
// when something changes, and the end card is still for its last seconds.
await b.ev(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:99999'; document.body.appendChild(d); let i = 0; setInterval(() => { d.style.background = (i++ % 2) ? '#000' : '#010101'; }, 33); })()`);
await b.sleep(800);

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
await b.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
await b.sleep(500);
// Restart brings the title card back with its fade-in, while the scene showing before fades out: no
// fades for a moment, so the title card is simply there alone from the first frame, then they're back.
await b.ev(`(() => { const s = document.createElement('style'); s.id = 'no-fade'; s.textContent = '.scene, .scene * { transition: none !important; animation: none !important; }'; document.head.append(s); document.getElementById('restart').click(); })()`);
recording = true;
await b.sleep(300);
await b.ev(`document.getElementById('no-fade').remove()`);
await b.sleep(LENGTH * 1000 - 300);
recording = false;
const stoppedAt = Date.now() / 1000; // the screencast's timestamps are in seconds since 1970 too
await b.send('Page.stopScreencast');

// ffconcat list: each frame lasts until the next one arrived
const lines = ['ffconcat version 1.0'];
frames.forEach((f, i) => {
  const next = frames[i + 1]?.t ?? Math.max(f.t + 0.04, stoppedAt); // the last one lasts to the end
  lines.push(`file '${f.file.split('/').pop()}'`, `duration ${(next - f.t).toFixed(4)}`);
});
lines.push(`file '${frames.at(-1).file.split('/').pop()}'`);
fs.writeFileSync(`${dir}/list.txt`, lines.join(String.fromCharCode(10)));
console.log('trailer', frames.length, 'frames', (frames.at(-1).t - frames[0].t).toFixed(1), 's');
b.close();
