# Board Game Night — Email Collector

A tiny offline-first PWA (installable web app) for collecting attendee emails in
person at board game night. One screen: **name + email + optional note → Add**.
Everything is saved on the device; export a night's list (or all of them) as CSV
via the phone's share sheet.

## Features
- Big touch targets, email keyboard, instant add, live count.
- Per-event grouping by date (defaults to today; tap the date chip to switch).
- Duplicate-email guard within a night, swipe-free delete with **Undo**.
- **Export CSV** → native share sheet (email/Drive/etc.), or download fallback.
- Works fully offline once installed (service worker caches the app shell).
- No accounts, no backend, no tracking. Data lives in the browser's localStorage.

## Files
```
index.html              app shell
styles.css              styling
app.js                  all logic
manifest.webmanifest    PWA manifest
sw.js                   service worker (offline cache)
icons/                  generated PNG icons
make_icons.py           regenerate icons (needs Pillow)
```

## Live URL
Deployed via GitHub Pages at:

**https://griswaldbrooks.com/boardgame-collector/**

## Install on your phone (then it works with NO internet / NO signal)
1. While you have signal, open the live URL above in Chrome on your phone.
2. Menu (⋮) → **Install app** / **Add to Home screen**.
3. Open it once from the home screen.

That's it. The service worker has now cached the whole app on your phone, and all
data is stored locally. Put the phone in airplane mode, go to a venue with no
Wi-Fi and no cell signal — it still opens and collects emails. CSV export to a
file / Drive works offline too (emailing the file just sends once you're back
online).

## Run / develop locally
```bash
python3 -m http.server 8123   # then open http://localhost:8123
```

## Move it to boardgamenightwg.com later (optional)
It's plain static files. To serve it under your main site, drop this folder into
the Zola site's `static/` (e.g. `static/collector/`) and rebuild, or add it as a
path on whatever host serves boardgamenightwg.com. Paths are all relative, so it
works under any sub-path.

## CSV format
`name, email, note, event_date, collected_at`
