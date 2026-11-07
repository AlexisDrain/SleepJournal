#!/bin/sh
# A headless Edge with a fresh, empty profile, for the scripts here to drive (port 9334, so it can run beside Recommendation Journal's on 9333).
# Then run `node load.mjs` to import the demo nights.
profile="${TMP:-/tmp}/sleep-journal-promo-edge"
rm -rf "$profile" && mkdir -p "$profile"
exec "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --remote-debugging-port=9334 \
  --user-data-dir="$(cygpath -w "$profile")" --force-device-scale-factor=2 \
  --no-first-run --no-default-browser-check --disable-sync about:blank
