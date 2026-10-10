// Publishes the app, stamping it with a build number first so you can tell which version a device runs
// (Settings → About shows it).
//
//   node scripts/release.js          web + phone, new build number
//   node scripts/release.js web      web only, new build number
//   node scripts/release.js phone    phone only, SAME build number (to match what is already on the web)
//
// "phone" publishes an EAS Update on the preview channel, which Expo Go picks up.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2] ?? 'all';
if (!['all', 'web', 'phone'].includes(target)) {
  console.error('Usage: node scripts/release.js [web|phone]');
  process.exit(1);
}
const app = path.join(__dirname, '..');
const infoFile = path.join(app, 'src', 'lib', 'buildInfo.json');
const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
const run = (cmd) => execSync(cmd, { cwd: app, stdio: 'inherit' });

if (target !== 'phone') {
  const now = new Date();
  info.version = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo.version;
  info.build += 1;
  info.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + '\n');
}
console.log(`\nSleep Journal ${info.version}, build ${info.build}\n`);

run('npx tsc --noEmit');
if (target !== 'phone') {
  fs.rmSync(path.join(app, 'dist'), { recursive: true, force: true });
  run('npx expo export --platform web');
  run('npx eas-cli@latest deploy --prod --non-interactive');
}
if (target !== 'web') {
  run(`npx eas-cli@latest update --channel preview --environment preview --message "Build ${info.build}" --non-interactive`);
}
console.log(`\nPublished build ${info.build} (${target}).`);
