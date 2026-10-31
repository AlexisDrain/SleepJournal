# Sleep Journal

A free, open-source sleep diary that takes about a minute a day. Note when you went to bed, how
you slept, and tick off your routines. Your journal stays on your device: no account, no ads, no
tracking.

**Try it now: https://sleep-journal.expo.app**

## Get the app

- **Any phone or computer:** open https://sleep-journal.expo.app in your browser. On iPhone, tap
  Share → **Add to Home Screen** to use it like an app.
- **Android:** download the `.apk` from the [Releases](https://github.com/AlexisDrain/SleepJournal/releases)
  page (coming soon). Google Play is on the way; see below.
- **iPhone App Store:** not yet. Use the web version for now.

## Features

- **Two quick check-ins:** at bedtime, when you got in bed and started trying to sleep; in the
  morning, when you woke up, how long it took to fall asleep, how rested you feel, a note and your
  dream. It saves as you type.
- **One question at a time,** or everything on one page, whichever you prefer.
- **Routines:** your own bedtime, morning and anytime checklists. Rename, reorder or hide items.
  Some can also record a time, a number or a note.
- **Tags** for a night, like *caffeine* or *insomnia*, plus naps.
- **Spreadsheet view** of every night, one page per year, with the columns you choose.
- **Sync between phone and computer** through your own private Google Sheet, both ways. There is
  no Google sign-in inside the app. [How to set it up](google-sheets/README.md).
- **Export** to Excel (`.xlsx`) or CSV, and **import** a CSV backup.
- **Reminders** on your phone, only if you haven't filled in that check-in yet.
- **Catches mistakes** like a wake-up time that would mean 23 hours of sleep (AM / PM mix-ups).
- **Calendar** to jump to any night, 12- or 24-hour time, and dark by design for use in bed.

## Your data

Everything is stored only on the device you use. Nothing is sent anywhere unless you connect your
own Google Sheet, and then only to that sheet. In a browser, clearing the site's data deletes the
journal on that browser, so export a backup or connect the Google Sheet first.

## Help test the Android app

Sleep Journal is on its way to Google Play, and Google asks new apps to be tested by at least 12
people for 14 days first. If you have an Android phone, you can help:

1. Join the testers group: GOOGLE_GROUP_LINK (you only need a Google account; it shares nothing else).
2. Open the test link on your phone and tap **Become a tester**: PLAY_TEST_LINK
3. Install Sleep Journal from Google Play and keep it installed for 14 days. Using it is a bonus.

Thank you!

## Support

Found a problem or have an idea? [Open an issue](https://github.com/AlexisDrain/SleepJournal/issues).

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