// Gets a fresh browser profile ready: past the welcome screens, then imports demo.csv (Settings →
// Import). Run once per profile, after starting Edge (see README).
import path from 'node:path';
import { connect } from './cdp.mjs';
const home = process.env.APP ?? 'http://localhost:8095';
const b = await connect();
await b.viewport(393, 852, 3);
await b.goto(`${home}/`, 5000);
// The dev server's first build can take a while: wait for the welcome screen (or the app) to appear.
for (let i = 0; i < 30 && !(await b.ev(`/Get started|Journal/.test(document.body.innerText)`)); i++) await b.sleep(1000);
if (await b.ev(`document.body.innerText.includes('Get started')`)) {
  await b.tap('Get started', 1200);
  await b.tap('Start journaling', 2000);
}
await b.send('Page.setInterceptFileChooserDialog', { enabled: true });
const chosen = new Promise((r) => b.on((m) => m.method === 'Page.fileChooserOpened' && r(m.params)));
await b.goto(`${home}/settings`, 4000);
await b.tap('Import .csv or .xlsx', 1500);
const p = await Promise.race([chosen, b.sleep(5000).then(() => null)]);
if (!p) throw new Error('No file chooser opened');
await b.send('DOM.setFileInputFiles', { files: [path.resolve('demo.csv')], backendNodeId: p.backendNodeId });
await b.sleep(5000);
console.log(await b.ev(`document.body.innerText.split(String.fromCharCode(10)).find((l) => l.startsWith('Imported')) ?? 'no import message'`));
b.close();
