# Sleep Journal

A private, offline sleep diary for iOS, Android and the web. **Try it: https://sleep-journal.expo.app**

Two quick check-ins a day (bedtime and morning), a customizable routine checklist, tags, naps,
reminders, and spreadsheet export. Everything is stored **only on your device**: no account, no
server. Optionally, it syncs with your own private Google Sheet.

Built with Expo (React Native + TypeScript) and **SQLite** with hand-written SQL.

```
app/
  src/app/        screens (Expo Router): Journal, Routines, Sheet, Settings, Welcome
  src/db/         migrations.ts (schema), store.ts (queries), csv.ts (export/import)
  src/components/ UI pieces: time pickers, routine checklist, swipe rows…
  src/lib/        types, date/time rules, reminders
  scripts/        make-icons.py (draws the app icon set; needs Python + Pillow)
  public/         web icons and manifest
google-sheets/    the optional Google Sheet sync script and its setup guide
```

## What's in the app

- **Journal**: bedtime, then morning, for one night. It saves as you type, opens on whatever is due
  now, and asks new users one question at a time ("Show everything on one page" switches that off).
  Tap the date for a calendar; naps for the day sit under Morning.
- **Routines**: tick off a night's bedtime / morning routine like a to-do list, or tap Edit to change
  the items, their order and the tags.
- **Sheet**: the whole journal as a color-coded spreadsheet, one page per year, drawn from the
  on-device database.
- **Settings**: reminders, export / import, the optional Google Sheet sync, and the version and
  build number this device is running.

## Run it

You need Node 22+, and **Expo Go** on your phone, signed in to the same free Expo account as the
CLI (required on physical iPhones since SDK 57).

```bash
cd app
npm install
npx expo login
npx expo start        # scan the QR code with the phone
```

## How the data works

- **One SQLite file on the phone** (`sleep-journal.db`). The schema lives in
  [`src/db/migrations.ts`](app/src/db/migrations.ts); SQLite's `PRAGMA user_version` records which
  migrations have run. After a release, never edit a shipped migration; append a new one.
- **"Night of" rule:** an entry belongs to the date the night *starts*. The night of Sep 26 is the one
  you wake up from on Sep 27.
- **Timestamps** are local ISO strings with their UTC offset (`2026-09-26T23:30:00-07:00`). SQL reads
  the wall-clock part for averages (`substr(x, 1, 16)`) and the real instant for durations (`julianday(x)`).
- **Routine items** are one checklist. Each item's `kind` says whether checking it also records a
  time, a number or a note (`check` | `time` | `number` | `text`).

## Export / import (backup)

Settings → **Export CSV** writes a `.csv` and opens the share sheet: save it to Files or Google Drive,
then open it in Google Sheets. **Import CSV** reads the same format back, skipping nights you already
have, so an export is also a backup and a way to move to a new phone.

## Google Sheet sync (optional)

Keep the journal in your own private Google Sheet, synced both ways, with one tab per year, without
logging in to Google in the app. The script is limited to that one spreadsheet (no Drive access). The sheet runs a small Apps Script
([`google-sheets/`](google-sheets/)) that the app reaches with a secret connection code.
Setup: [google-sheets/README.md](google-sheets/README.md).

## Share it without paying Apple

| Who | How | Cost |
|---|---|---|
| You, on your iPhone or Android | `npx eas-cli@latest update --channel preview`, then open the project in Expo Go (signed in) | Free |
| Anyone on Android | `npx eas-cli@latest build -p android --profile preview` → attach the `.apk` to a GitHub Release | Free tier |
| Anyone, in a browser | https://sleep-journal.expo.app (EAS Hosting) | Free tier |
| Anyone on iPhone | TestFlight / App Store | Apple Developer Program |

`app.json` uses `"runtimeVersion": { "policy": "sdkVersion" }`, which resolves to `exposdk:57.0.0`,
the runtime Expo Go has. The `update:configure` default (`appVersion` → `1.0.0`) can't be opened in Expo Go.

Since May 2026, Expo Go only opens EAS Updates from projects your own Expo account owns, so for
other people use the Android APK (or the App Store). The first `eas build` will ask for an Android
package name like `io.github.<your-handle>.sleepjournal`.

## Web version

The same app runs in the browser (`npx expo start --web`), with SQLite compiled to WebAssembly
(each browser keeps its own journal; connect the Google Sheet to share it with your phone).
Phone-only parts have `.web.tsx` / `.web.ts` stand-ins: browser time inputs, downloads instead of the
share sheet, and no reminders. Deploy:

```bash
cd app
npx expo export --platform web
npx eas-cli@latest deploy --prod
```

## Releasing

`npm run release` (in `app/`) does both of the above in one go: it bumps the build number in
[`src/lib/buildInfo.json`](app/src/lib/buildInfo.json), deploys the web version and publishes the
EAS Update for the phone. **Settings → About** shows the version and build number, so you can check
that a device has picked up the latest release. `npm run release:web` publishes only the web
version (new build number); `npm run release:phone` then sends that same build to the phone.

## Privacy & security notes

- No network requests unless you export or connect your own Google Sheet (then only to your sheet's script).
- Personal exports are git-ignored (`*.csv`); don't commit your own data.
- Protect your Expo and GitHub accounts with 2FA: whoever controls the Expo project can publish updates.

## License

MIT, see [LICENSE](LICENSE).
