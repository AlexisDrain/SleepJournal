# App Store page

The app is called **1-Minute Sleep Journal** on the App Store (plain "Sleep Journal" was
taken). Under its icon on a home screen it's still "Sleep Journal", which fits there.

Everything for the App Store Connect page: the words to paste in, and the pictures and videos to
upload. All the nights, notes and dreams shown are made up (see `source/make-demo.py`).

## Words

### Promotional Text (162 / 170 characters)

You can change this one any time, without sending a new version for review.

Alexis: A free, open-source sleep diary that takes about a minute a day. Your journal stays on your device: no account, no ads, no tracking.
```
Two quick check-ins a day: log your nights in a few taps, watch your patterns over the weeks, and share a clear report with your therapist. Free, with no account.
```

### Subtitle (30 characters at most)

Shown under the app's name. It's in the App Information section, not the version page.
**Chosen: option 5, "Quick diary, morning and night".** The others are kept for reference.

Alexis: Quick diary, morning and night

**Option 1 (the current one), 29 / 30:**

```
Private diary for better rest
```

**Option 2, 25 / 30.** The same line as the welcome screen, the video end card and the Header art,
so it would appear twice on the page, a few lines apart:

```
Two quick check-ins a day
```

**Option 3, 28 / 30.** Brings in the therapy angle. If you pick it, take `cbt-i` out of the
Keywords (the subtitle is searched already) and use the room for another word:

```
Simple sleep diary for CBT-I
```

**Option 4, 29 / 30.** Says how often. "sleep" is already in the name (searched already), so
that word adds nothing to search:

```
Quick sleep diary twice a day
```

**Option 5, 30 / 30 (chosen).** Option 4 without the repeated "sleep", adding "morning" and "night"
to search instead:

```
✅Quick diary, morning and night
```

### Description (Alexis's: 898 / 4,000 characters; the long one below: 2,350)

"My psychiatrist said that most sleep apps are bloated, so I made a simple, no frills solution. 1-Minute Sleep Journal is a"

Alexis:
A free, open-source sleep diary that takes about a minute a day. Note when you went to bed, how you slept, and tick off your routines. Your journal stays on your device: no account, no ads, no tracking.

How to use:
- At bedtime: Note when you got in bed and started trying to sleep.
- In the morning: Say how rested you feel, how long it took to fall asleep, and when you woke up.

You also have an optional Routines tab. Think of it as a daily to-do checklist before going to bed, when waking up, and during the day. You can add your custom routines to it.

See your stats and a printable report to share with your therapist (PDF, web page or Markdown). Doing CBT-I? Add its two morning questions in one tap.

You can sync your data between devices using your own Google Sheet (optional).

Preview music: "Inspired" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/


```
A sleep diary you'll actually keep. Two quick check-ins a day: one before bed, one when you wake up. Over the weeks, you see how you really sleep, and what helps.

BEDTIME AND MORNING, IN A FEW TAPS
When you got in bed, when you tried to sleep, when you woke up and started the day. How long it took to fall asleep, how rested you feel, and a note if you like. Tap "Set to now" and you're done. Prefer it slower? Turn on one question at a time.

SEE YOUR PATTERNS
Stats shows your averages, a chart of hours asleep night by night, and the tags that come up most (caffeine, exercise, stress, or your own). Look at the last 7, 30 or 90 nights, a year, or everything.

READY FOR YOUR THERAPIST
Night by night is a clean table of every night, and you choose its columns. See a printable report with your averages, the chart and that table, in light or dark, and save it as a PDF, a web page or Markdown to share. Or export the nights as an .xlsx or .csv. Your dreams stay out of the report.

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

### Keywords (100 / 100 characters)

Commas, no spaces. The app's name and subtitle (1-Minute Sleep Journal, Quick diary, morning and
night) are already searched, so their words aren't repeated here. Since the subtitle changed:
"rest" is back (the old subtitle had it), "cbti" is added (people type it without the hyphen too),
and "report" made room for them. Naps were removed from the app (Nov 2026), so "nap" became
"cbt" (people search for CBT as well as CBT-I).

```
insomnia,cbt-i,cbti,tracker,log,dreams,bedtime,routine,habits,patterns,wake,therapy,cbt,rest,offline
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

### Privacy Policy URL

Required for every app (App Information → Privacy Policy URL). It's `PRIVACY.md` in the repo, so
commit and push it first, or this link shows a 404.

```
https://github.com/AlexisDrain/SleepJournal/blob/main/PRIVACY.md
```

### App Privacy

In App Store Connect → App Privacy, answer **"No, we do not collect data from this app"** ("Data Not
Collected"). The journal stays on the device; Google Sheet sync goes from the device to the person's
own sheet, not to the developer. See `PRIVACY.md`.

### Categories

- **Primary: Health & Fitness.** Where sleep trackers and diaries are, and where people browse for them.
- **Secondary: Lifestyle.** Routines and habits.

Not Medical: that category is for clinical tools, and Apple reviews apps there more strictly. A
diary you share with a therapist isn't one.

### Copyright

Apple adds the © itself.

```
2026 Alexis Drain
```

## Reviewer Notes

```
No account or sign-in is needed: everything is stored on the device. Syncing with a Google Sheet (Settings → Google Sheet) is optional and needs the user's own Google Sheet; the rest of the app works fully without it.
```

### Reviewer Notes for the resubmission (after the Guideline 2.1 "Information Needed" reply)

Apple asked for a screen recording plus five answers in the Notes field. Paste this, and attach the
recording (see "Review recording" below):

```
1. SCREEN RECORDING
Attached: recorded on an iPhone running the latest iOS, starting from launching the app. There is no account, sign-in, user-generated content shared with others, or paid content in this app.

2. PURPOSE AND AUDIENCE
1-Minute Sleep Journal is a free, open-source sleep diary for adults who want to understand their sleep, including people doing CBT-I (cognitive behavioral therapy for insomnia) whose therapist asks them to keep a sleep diary. Two quick check-ins a day (at bedtime and in the morning) record when they went to bed, how long it took to fall asleep, when they woke and how rested they feel. Stats and a printable report show patterns over the weeks and can be shared with a therapist. The app is a diary only: it gives no diagnosis, treatment or medical advice.

3. HOW TO USE IT
No login, demo account or sample files are needed: everything works offline on the device.
- On first launch, a short welcome (optionally turning on reminders), then "Start journaling" opens the Journal tab.
- Journal: tap "Set to now" on the Bedtime card, then fill in the Morning card.
- Routines: optional checklists for bedtime, morning and the day.
- Stats: averages, a chart and a night-by-night table; "Go to printable report" previews a report and saves it as PDF, HTML or Markdown through the share sheet. Dreams and Sheet are reached from the card on Stats.
- Settings: optional reminders (local notifications), export/import of the journal as .xlsx or .csv, and optional sync with the user's own Google Sheet.
Google Sheet sync is optional and needs the user's own Google account: the user makes a copy of a template sheet, deploys the script inside it as their own Apps Script web app, and pastes its web address and a secret key into Settings → Google Sheet. The app then sends the journal straight from the device to that sheet. Setup guide (done on a computer, about 3 minutes): https://github.com/AlexisDrain/SleepJournal/tree/main/google-sheets. It is not needed to review any other feature.

4. EXTERNAL SERVICES
- Expo (EAS Update): delivers app updates. No user data is sent.
- Google Apps Script / Google Sheets: only if the user connects their own sheet (above). The developer has no server and never receives any data.
No analytics, ads, AI, authentication or payment services. Setup guide is here: https://github.com/AlexisDrain/SleepJournal/tree/main/google-sheets

5. REGIONS
The app works the same in every region. It is in English; dates and times follow the device's settings.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable: it is a personal diary, not a medical device, and gives no medical advice. The app previews use the music "Inspired" by Kevin MacLeod (incompetech.com) under Creative Commons Attribution 4.0, credited in the previews and the description.
```

### Review recording (for Apple, not the store)

On the iPhone: Control Center → Screen Recording. About 1–2 minutes. Delete the app and install it
again from TestFlight first, so the recording starts at the welcome screens.

1. Start on the Home Screen and tap the app's icon.
2. The welcome: "Get started", "Remind me at 10:30 PM and 10 AM" (allow notifications), "Start journaling".
3. Journal: Bedtime "Set to now", a note; then the Morning card.
4. Routines: tick a couple of items.
5. Stats: scroll, open Dreams and Sheet from the card, then "Go to printable report" and save a PDF.
6. Settings: turn on a reminder, tap Export, and show the Google Sheet card (no need to connect).

Don't show a real sheet's web address or secret key. Attach the file in App Store Connect → App
Review Information → Attachment, or to the reply in App Review.

## Pictures and videos

| Field in App Store Connect | File | Size |
|---|---|---|
| Header Asset | `header/header-5244x2950.png` (or `header-3840x1646.png`) | 5244 × 2950, 3840 × 1646 |
| Search Results Asset | `search-results/search-5244x2950.png` (or the 3840 × 2560 / 1920 × 1280 ones) | all three supported sizes |
| iPhone screenshots (6.1" / 6.3") | `screenshots/iphone/01…10` (with captions), or `screenshots/iphone-plain/` | 1179 × 2556 |
| iPhone app previews | `app-previews/1-checkin`, `2-stats` (`3-sheet` is kept but not used) | 886 × 1920, 30 fps, 20–28 s |

- **Screenshots:** upload them in number order. The first three are the ones most people see in
  search results. Use either the captioned set or the plain one, not a mix.
- **Header and Search Results:** on an iPhone the App Store shows only about the middle 40% of the
  width and the upper-middle half of the height of these (from about 17% to 58%), zoomed in, with
  the icon and name printed right under it. Phone screenshots there were too small to read (the
  first version had them). So, as in Recommendation Journal's: the app's name, a short line ("Two quick check-ins a day") and two
  of the app's own check-in cards (Bedtime ✓, Morning ✓), drawn big, all inside that area. Run
  `node art.mjs search-1920x1280 --guide` to see it outlined.
- **Banner (not for the App Store):** `banner/` has the earlier art with the icon, the name and three
  phones, for places that show the whole picture: `banner-1280x640.png` for GitHub (Settings →
  Social preview), `banner-1270x760.png` for Product Hunt's gallery, and two big ones for a website.
  Made from `source/banner.html` with `node art.mjs --banner`.
- **App previews:** H.264 .mp4 files with music: "Inspired" by Kevin MacLeod
  (`promo/trailer/Inspired.mp3`). Its licence (CC BY 4.0) lets anyone use it, ads included, as long as
  it's credited, so each preview ends on a 3-second card with the credit, and the Description
  carries it too. Previews start muted on the App Store; people tap for sound. After uploading,
  App Store Connect asks for a poster frame: pick one from the app, not the credit card.
  1. `1-checkin`: the morning check-in, down to the bottom of the page, then the morning routine
     (scrolled to the middle of the screen) with the CBT-I questions.
  2. `2-stats`: the averages, the chart, night by night in the sheet's colors, then the printable
     report: its preview, and in dark.
  3. `3-sheet` (**not used**: too much at once, and niche features): the spreadsheet, the Google
     Sheet card, and the CBT-I questions in Settings. Kept in case.
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
   `encode.sh` reads the music from `promo/trailer/Inspired.mp3`, or from the file named in `MUSIC`.
   Check each one before using it: `ffmpeg -i out/previews/checkin.mp4 -vf "fps=2,scale=221:480,tile=11x4" -frames:v 1 check.png`.
7. Trailer video (`trailer/sleep-journal-trailer.mp4`, 1920 × 1080, 49.5 s, for Product Hunt,
   GitHub or a website; too long for an App Store preview): serve `promo/trailer`
   (`python -m http.server 8097 --bind 127.0.0.1` there), then in `source/` run `node trailer.mjs`
   and `sh trailer.sh`. It records the trailer page from Restart to its end and adds the music.

The scripts set the page's clock to a fixed day (Nov 6–7, 2026), so the shots always show the same
nights whatever today's date is. They read from and write to `raw/`, `out/` and `frames/` next to
themselves (git-ignored): copy the results into the folders above.

## Product Hunt

Launch after the App Store approves the app. Tuesday to Thursday, at 12:01 AM Pacific time.

**Name:** 1-Minute Sleep Journal

**Link to the product (main link):** the web app, so visitors can try it in seconds without installing anything.

```
https://sleep-journal.expo.app
```

**More links:** the App Store page (`https://apps.apple.com/app/id<the Apple ID>`), the GitHub
repository (it's open source), and the Android APK
(`https://github.com/AlexisDrain/SleepJournal/releases/latest`).

**Tagline (52 / 60):**

```
A free, private sleep diary, in about a minute a day
```

Other options: "A simple sleep diary to share with your therapist" (49), "Two quick check-ins a day.
No account, no ads, no tracking." (59).

**Description (249 / 260):**

```
Two quick check-ins a day: one at bedtime, one when you wake up. See your patterns in Stats, then share a printable report with your therapist. Doing CBT-I? Its questions are one tap away. Free, open source, offline, no account, no ads, no tracking.
```

**Pricing:** Free. **Topics:** Health & Fitness, Open Source, Productivity (or a Sleep topic, if
the search finds one).

**Pictures:** thumbnail `app/assets/icon.png` (Product Hunt asks for 240 × 240), gallery
`banner/banner-1270x760.png` first, then screenshots. **Video:** Product Hunt takes a YouTube
link, so upload `trailer/sleep-journal-trailer.mp4` to YouTube first (Unlisted works).

**First comment (from you, the maker; change it to sound like you):**

```
Hi Product Hunt! 👋

My psychiatrist told me that most sleep apps are bloated, so I made a simple one with no frills.

1-Minute Sleep Journal is a sleep diary: one quick check-in at bedtime (when you got in bed and tried to sleep) and one in the morning (when you woke up, how long it took to fall asleep, how rested you feel). Over the weeks, Stats shows your patterns, and the printable report (PDF, web page or Markdown) is ready to bring to a therapist.

A few things I cared about:
• Private: your journal stays on your device. No account, no ads, no tracking.
• Free and open source: every line is on GitHub.
• CBT-I: if you're doing therapy for insomnia, its two morning questions are one tap away.
• Optional sync with your own Google Sheet, so your phone and computer share one journal (the app never sees your Google login).

It's on the web, the App Store and Android (APK on GitHub). I'd love your feedback: what would make it fit your nights better?
```
