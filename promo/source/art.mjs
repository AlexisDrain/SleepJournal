// Captures the art pages at each size, into out/ (serve this folder on port 8098 first, see README).
//   node art.mjs              the App Store's Header and Search Results pictures (art.html)
//   node art.mjs --banner     the banner with three phones (banner.html): GitHub, Product Hunt, a website
//   node art.mjs <name>       just one of them;  --guide  outlines the part the App Store shows
// Pictures too big for one capture are taken in two halves: run join.py afterwards.
import fs from 'node:fs';
import { connect } from './cdp.mjs';
const b = await connect();
const guide = process.argv.includes('--guide');
const banner = process.argv.includes('--banner');
const url = `http://127.0.0.1:8098/${banner ? 'banner' : 'art'}.html`;
const jobs = banner
  ? [
    ['banner-5244x2950', 5244, 2950, 'header', false],
    ['banner-3840x1646', 3840, 1646, 'header', true],
    ['banner-1280x640', 1280, 640, 'header', true], // GitHub: Settings → Social preview
    ['banner-1270x760', 1270, 760, 'header', false], // Product Hunt: gallery images
  ]
  : [
    ['header-5244x2950', 5244, 2950, 'header', false],
    ['header-3840x1646', 3840, 1646, 'header', true],
    ['search-5244x2950', 5244, 2950, 'search', false],
    ['search-3840x2560', 3840, 2560, 'search', false],
    ['search-1920x1280', 1920, 1280, 'search', false],
  ];
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
for (const [name, w, h, kind, wide] of jobs.filter((j) => !only || j[0] === only)) {
  await b.viewport(w / 2, h / 2, 2, false);
  await b.send('Page.navigate', { url: `${url}?kind=${kind}${wide ? '&wide=1' : ''}${guide ? '&guide=1' : ''}` });
  await b.sleep(2500);
  if (w <= 4096 && w * h <= 8_000_000) await b.shot(`out/${name}.png`);
  else for (const [i, x] of [[0, 0], [1, w / 4]]) { // too big for one capture (it hangs): two halves, joined by join.py
    const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x, y: 0, width: w / 4, height: h / 2, scale: 1 } });
    fs.writeFileSync(`out/${name}.half${i}.png`, Buffer.from(data, 'base64'));
  }
  console.log(name);
}
b.close();
