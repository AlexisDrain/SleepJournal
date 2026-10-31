# Developing Sleep Journal

Notes for working on the code. The [README](README.md) is for people using the app.

Built with Expo (React Native + TypeScript) and **SQLite** with hand-written SQL.

```
app/
  src/app/        screens (Expo Router): Journal, Routines, Sheet, Settings, Welcome
  src/db/         migrations.ts (schema), store.ts (queries), csv.ts (export/import), sync.ts (Google Sheet)
  src/components/ UI pieces: time pickers, routine checklist, swipe rows…
  src/lib/        types, date/time rules, reminders
  scripts/        release.js (publish web + phone), make-icons.py (app icon set; needs Python + Pillow)
  public/         web icons and manifest
google-sheets/    the optional Google Sheet sync script and its setup guide
trailer/          the animated trailer page
```

## Run it

You need Node 22+, and **Expo Go** on your phone, signed in to the same free Expo account as the
CLI (required on physical iPhones since SDK 57; the project is on SDK 58).

```bash
cd app
npm install
npx expo login
npx expo start        # scan the QR code with the phone; press w for the web version
```

## How the data works

- **One SQLite file on the device** (`sleep-journal.db`; in a browser, SQLite compiled to WebAssembly).
  The schema lives in [`src/db/migrations.ts`](app/src/db/migrations.ts); SQLite's `PRAGMA user_version`
  records which migrations have run. After a release, never edit a shipped migration; append a new one.
- **"Night of" rule:** an entry belongs to the date the night *starts*. The night of Sep 26 is the one
  you wake up from on Sep 27. The app moves to the next night at 3 PM; bedtime stays due until 3 AM.
- **Timestamps** are local ISO strings with their UTC offset (`2026-09-26T23:30:00-07:00`). SQL reads
  the wall-clock part for averages (`substr(x, 1, 16)`) and the real instant for durations (`julianday(x)`).
- **Routine items** each have a `kind`: checking it can also record a time, a number or a note
  (`check` | `time` | `number` | `text`). Items have a `uid` that is the same on every synced device.
- **Phone-only parts** have `.web.tsx` / `.web.ts` stand-ins: browser time inputs, downloads instead of
  the share sheet, and no reminders.

## Forking

Publishing your own copy? These point at this project, so change them first:

- `app/app.json`: `owner`, `slug`, `extra.eas.projectId` and the `updates.url` built from it, the iOS
  `bundleIdentifier` and the Android `package`
- `app/src/lib/links.ts`: `SUPPORT_EMAIL`, `REPO_URL` and `SHEET_TEMPLATE_URL` (your own template sheet)

## Releasing

```bash
cd app
npm run release        # new build number, then web (EAS Hosting) + phone (EAS Update, preview channel)
```

`npm run release:web` publishes only the web version (new build number); `npm run release:phone`
sends that same build to the phone. **Settings → About** shows the version and build number.

`app.json` uses `"runtimeVersion": { "policy": "sdkVersion" }`, which resolves to `exposdk:58.0.0`,
the runtime Expo Go has. Since May 2026, Expo Go only opens EAS Updates from projects your own Expo
account owns, so other people need a build:

| Who | How | Cost |
|---|---|---|
| You, in Expo Go | `npm run release:phone` | Free |
| Anyone on Android | `npx eas-cli@latest build -p android --profile apk` → attach the `.apk` to a GitHub Release | Free tier |
| Testers on Google Play | `npx eas-cli@latest build -p android --profile production` → upload the `.aab` to a closed test in Play Console | $25 once |
| Anyone, in a browser | https://sleep-journal.expo.app (EAS Hosting) | Free tier |
| Anyone on iPhone | TestFlight / App Store | Apple Developer Program |

**Android APK on GitHub Releases.** Build with `npx eas-cli@latest build -p android --profile apk`
(production update channel; the version code goes up by itself), then publish the APK as a GitHub
release tagged `android-<versionCode>`, e.g. `android-12`. Installed APKs check the latest release
once a day and offer it if the number is higher. Release a new APK only for native changes; everything
else reaches them as an update.

Play builds use the `production` update channel; the release script publishes to `preview`, so add
`production` to it before Play testers rely on updates. The first `eas build` asks for an Android
package name like `io.github.<your-handle>.sleepjournal`.

## Privacy & security notes

- No network requests unless you export or connect your own Google Sheet (then only to your sheet's script).
- Personal exports are git-ignored (`*.csv`, `*.xlsx`); don't commit your own data.
- Protect your Expo and GitHub accounts with 2FA: whoever controls the Expo project can publish updates.
