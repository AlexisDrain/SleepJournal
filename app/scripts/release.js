// Publishes the app, stamping it with a build number first so you can tell which version a device runs
// (Settings → About shows it).
//
//   node scripts/release.js          web + phone, new build number
//   node scripts/release.js web      web only, new build number
//   node scripts/release.js phone    phone only, SAME build number (to match what is already on the web)
//   node scripts/release.js expo-go  Expo Go only, SAME build number: try it on the phone before the
//                                    installed (TestFlight) app gets it with "phone"
//
// "phone" publishes an EAS Update on the preview channel (Expo Go) and the production channel
// (the installed app from TestFlight, the App Store or Google Play).
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2] ?? 'all';
if (!['all', 'web', 'phone', 'expo-go'].includes(target)) {
  console.error('Usage: node scripts/release.js [web|phone|expo-go]');
  process.exit(1);
}
const app = path.join(__dirname, '..');
const infoFile = path.join(app, 'src', 'lib', 'buildInfo.json');
const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
const run = (cmd) => execSync(cmd, { cwd: app, stdio: 'inherit' });

const sameBuild = target === 'phone' || target === 'expo-go';
if (!sameBuild) {
  const now = new Date();
  info.version = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo.version;
  info.build += 1;
  info.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + '\n');
}
console.log(`\nSleep Journal ${info.version}, build ${info.build}\n`);

run('npx tsc --noEmit');
if (!sameBuild) {
  fs.rmSync(path.join(app, 'dist'), { recursive: true, force: true });
  run('npx expo export --platform web');
  run('npx eas-cli@latest deploy --prod --non-interactive');
}
if (target !== 'web') {
  // preview: Expo Go. production: the installed app (TestFlight / App Store, Google Play).
  for (const channel of target === 'expo-go' ? ['preview'] : ['preview', 'production']) {
    run(`npx eas-cli@latest update --channel ${channel} --environment ${channel} --message "Build ${info.build}" --non-interactive`);
  }
}
console.log(`\nPublished build ${info.build} (${target}).`);
