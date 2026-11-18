// A desktop shot of the web app, for places that show the website (Product Hunt's gallery):
// raw/web-journal.png and raw/web-stats.png at 1440 × 900 (2×). Needs a profile with demo.csv
// imported (load.mjs). Framed by web-frame.py.
import { connect } from './cdp.mjs';
const b = await connect();
const home = process.env.APP ?? 'http://localhost:8095';
await b.viewport(1440, 900, 2, false);
// Evening, Nov 6: tonight (after the last demo night) is still empty, so the Journal shows both
// check-ins blank, ready to fill in.
await b.clock('2026-11-06T21:30:00');
// The dev server can be slow to draw a page: wait for its words.
const waitFor = async (text) => { for (let i = 0; i < 30 && !(await b.ev(`document.body.innerText.includes(${JSON.stringify(text)})`)); i++) await b.sleep(1000); await b.helper(); await b.sleep(800); };
await b.goto(`${home}/`, 3000);
await waitFor('Morning');
await b.shot('raw/web-journal.png');
await b.goto(`${home}/stats`, 3000);
await waitFor('90 nights');
await b.tap('All', 2000);
await b.shot('raw/web-stats.png');
console.log('shot raw/web-journal.png, raw/web-stats.png');
b.close();
