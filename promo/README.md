# App Store page

Everything for the App Store Connect page: the words to paste in, and the pictures and videos to
upload. All the nights, notes and dreams shown are made up (see `source/make-demo.py`).

## Words

### Promotional Text (161 / 170 characters)

You can change this one any time, without sending a new version for review.

```
A one-minute sleep diary. Log your nights in a few taps, watch your patterns over the weeks, and share a clear report with your therapist. Free, with no account.
```

### Subtitle (24 / 30 characters)

Shown under the app's name. It's in the App Information section, not the version page.

```
A one-minute sleep diary
```

### Description (2,277 / 4,000 characters)

```
A sleep diary you'll actually keep. Two quick check-ins a day: one before bed, one when you wake up. Over the weeks, you see how you really sleep, and what helps.

BEDTIME AND MORNING, IN A FEW TAPS
When you got in bed, when you tried to sleep, when you woke up and started the day. How long it took to fall asleep, how rested you feel, and a note if you like. Tap "Set to now" and you're done. Prefer it slower? Turn on one question at a time.

SEE YOUR PATTERNS
Stats shows your averages, a chart of hours asleep night by night, and the tags that come up most (caffeine, exercise, stress, or your own). Look at the last 7, 30 or 90 nights, a year, or everything.

READY FOR YOUR THERAPIST
Night by night is a clean table of every night, and you choose its columns. Share it as a PDF report with your averages, the chart and sleep efficiency, or export it as an .xlsx or .csv. Your dreams stay out of the report.

DOING CBT-I?
Therapy for insomnia (CBT-I) asks how many times you woke in the night and how long you were awake. Add its two questions to your morning in one tap: Stats shows them night by night, and hours asleep leave out the time awake.

ROUTINES
Checklists for bedtime, the morning and the day: brush teeth, phone away from the bed, some sunlight, exercise. An item can be a tick, a time, a number or a note.

YOUR DREAMS
Write down what you dreamed while you still remember. Read them all back later, search them, or open one at random.

YOUR JOURNAL AS A SPREADSHEET
The Sheet tab shows everything as a color-coded table. Move your journal to a new phone by exporting it and importing it there.

REMINDERS
A gentle nudge at bedtime and in the morning, at the times you choose.

PRIVATE BY DESIGN
No account, no sign-up, no ads, no tracking. Your journal is stored on your phone and works offline. If you want, sync it with your own private Google Sheet, so your phone and your computer share one journal. The app never sees your Google login.

Dark by default (it's mostly opened in bed), with a light look, or light by day and dark at night.

Free and open source. Also available as a web app.

Preview music: "Inspired" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/
```

### Keywords (98 / 100 characters)

Commas, no spaces. The app's name and subtitle are already searched, so their words aren't repeated
here.

```
insomnia,cbt-i,tracker,log,dreams,bedtime,routine,habits,rest,wake,therapy,nap,report,offline,cbti
```

### Support URL

```
https://github.com/AlexisDrain/SleepJournal/issues
```

### Marketing URL

The web version of the app.

```
https://sleep-journal.expo.app
```

### Copyright

Apple adds the © itself.

```
2026 Alexis Drain
```

## Reviewer Notes

```
No account or sign-in is needed: everything is stored on the device. Syncing with a Google Sheet (Settings → Google Sheet) is optional and needs the user's own Google Sheet; the rest of the app works fully without it.
```

## Pictures and videos

| Field in App Store Connect | File | Size |
|---|---|---|
| Header Asset | `header/header-5244x2950.png` (or `header-3840x1646.png`) | 5244 × 2950, 3840 × 1646 |
| Search Results Asset | `search-results/search-5244x2950.png` (or the 3840 × 2560 / 1920 × 1280 ones) | all three supported sizes |
| iPhone screenshots (6.1" / 6.3") | `screenshots/iphone/01…10` (with captions), or `screenshots/iphone-plain/` | 1179 × 2556 |
| iPhone app previews | `app-previews/1-checkin`, `2-stats`, `3-sheet` | 886 × 1920, 30 fps, 20–25 s |

- **Screenshots:** upload them in number order. The first three are the ones most people see in
  search results. Use either the captioned set or the plain one, not a mix.
- **Search Results Asset:** App Store search shows only about the middle of this picture (the sides
  and the top and bottom are cut off), so the icon, the name and the phones all sit inside the
  middle 55% × 66%. Run `node art.mjs search-1920x1280 --guide` to see that box outlined.
- **App previews:** H.264 .mp4 files with music: "Inspired" by Kevin MacLeod
  (`trailer/Inspired.mp3`). Its licence (CC BY 4.0) lets anyone use it, ads included, as long as
  it's credited, so each preview ends on a 3-second card with the credit, and the Description
  carries it too. Previews start muted on the App Store; people tap for sound. After uploading,
  App Store Connect asks for a poster frame: pick one from the app, not the credit card.
  1. `1-checkin`: the morning check-in, then the morning routine with the CBT-I questions.
  2. `2-stats`: the averages, the chart, night by night, then the dreams.
  3. `3-sheet`: the spreadsheet, the Google Sheet card, and the CBT-I questions in Settings.
- **iPad:** not needed. The app is iPhone-only (`supportsTablet: false` in `app/app.json`), so App
  Store Connect shouldn't ask for iPad screenshots.

The pictures come from the web version of the app, drawn at exact iPhone sizes, with an iPhone
status bar and home bar added. So the fonts are Windows' (Segoe UI) rather than the iPhone's. If
you'd rather show the real iPhone look, take screenshots on an iPhone with a 6.1" or 6.3" screen:
those are already 1179 × 2556.

## Other fields

- **App Clip** and **iMessage App:** leave them empty. They're optional, and the app has no use for
  either.
- **App Review → Sign-in required:** untick it (there are no accounts). Never enter an Apple ID
  there. The Reviewer Notes above say that Google Sheet sync is optional.
- **Captioned screenshots are allowed,** as long as each one shows the real app (they do).
- **Before submitting, make a fresh iOS build,** so the app starts with the current code (an older
  build shows its old code on first launch, before an update arrives).

## Making them again

After the app's look changes, `source/` can make everything again from the web version. You need
the dev server (`npx expo start --web --port 8095` in `app/`), Microsoft Edge, Python with Pillow,
and ffmpeg. Everything runs in `source/`.

1. Demo data (only if `make-demo.py` changed): `python make-demo.py` writes `demo.csv`.
2. Start a headless Edge with a fresh profile: `sh edge.sh` (leave it running). It uses port 9334,
   so it can run beside Recommendation Journal's (9333).
3. `node load.mjs`: past the welcome screens, then imports `demo.csv`.
4. Screenshots: `node shoot.mjs`, then `python frame.py`. The last shot fills in a bedtime, so to
   take them again, start again from step 2. `node shoot.mjs 03` takes just one.
5. Art: `cp ../../app/assets/icon.png out/icon.png`, serve this folder
   (`python -m http.server 8098 --bind 127.0.0.1`), then `node art.mjs` and `python join.py`
   (pictures too big for one capture are taken in two halves).
6. Previews: from a fresh profile (steps 2 and 3), `python overlay.py` and `python endcard.py`, then
   `node rec.mjs checkin`, `stats` and `sheet`, then `sh encode.sh checkin` (and so on).
   `encode.sh` reads the music from `trailer/Inspired.mp3`, or from the file named in `MUSIC`.
   Check each one before using it: `ffmpeg -i out/previews/checkin.mp4 -vf "fps=2,scale=221:480,tile=11x4" -frames:v 1 check.png`.

The scripts set the page's clock to a fixed day (Nov 6–7, 2026), so the shots always show the same
nights whatever today's date is. They read from and write to `raw/`, `out/` and `frames/` next to
themselves (git-ignored): copy the results into the folders above.
