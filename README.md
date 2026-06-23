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

## Run locally
```bash
python3 -m http.server 8123
# then open http://localhost:8123
```

## Use it on your phone tonight (same Wi-Fi)
Start the server above, then on your phone visit:
```
http://192.168.50.126:8123
```
Data entry + CSV share work immediately. (Full offline mode and a clean
"install" require HTTPS — see below — but over Wi-Fi this is ready to use.)

## Deploy to boardgamenightwg.com (recommended)
It's all static files — upload the folder to any HTTPS host (your web host,
Netlify, GitHub Pages, Cloudflare Pages). Once served over **https**, open it in
Chrome on your phone → menu → **Add to Home screen** / **Install app**. It then
launches full-screen like a native app and works with no signal.

## CSV format
`name, email, note, event_date, collected_at`
