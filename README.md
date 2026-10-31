# Sleep Journal

A free, open-source sleep diary that takes about a minute a day. Note when you went to bed, how you slept, and tick off your routines. Your journal stays on your device: no account, no ads, no tracking.

You can sync your data between devices using Google Sheet.

**Try it now: https://sleep-journal.expo.app**

## Get the app

- **Any phone or computer:** open https://sleep-journal.expo.app in your browser.
- **Android:** download the `.apk` from the [Releases](https://github.com/AlexisDrain/SleepJournal/releases)
  page (coming soon).
- **iPhone App Store:** not yet. Use the web version for now.

## Forking

Publishing your own copy? These point at this project, so change them first:

- `app/app.json`: `owner`, `slug`, `extra.eas.projectId` and the `updates.url` built from it, the iOS
  `bundleIdentifier` and the Android `package`
- `app/src/lib/links.ts`: `SUPPORT_EMAIL`, `REPO_URL` and `SHEET_TEMPLATE_URL` (your own template sheet)

## License

MIT, see [LICENSE](LICENSE). Notes for developers are in [DEVELOPING.md](DEVELOPING.md).

Trailer music: "Inspired"
Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
http://creativecommons.org/licenses/by/4.0/
