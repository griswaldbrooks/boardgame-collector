# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## What this app is

Tauri 2 Android WebView shell (not a PWA — see `docs/adr/0001-tauri-2-not-pwa.md`),
following the skydash-app pattern but with the frontend bundled (`frontendDist`).
The design spec lives in `README.md` (handoff spec).

Flow 1 (Home → Add to mailing list → Done), Flow 2 (Message the list), and
Flow 4 (Save a contact) are implemented in framework-free ES modules under
`src/`. The v1 add mechanism is coordinator-initiated (captain decision
2026-08-18, `docs/adr/0005-coordinator-initiated-adds.md`, superseding-in-part
ADR 0002): the door screens queue addresses in the device-local queue
(`src/queue.js`) with zero member action; the drain screen (reachable from
Home when the queue is non-empty) presents copy-ready paste blocks for Google
Groups' owner Add members UI — FIFO batches capped defensively at ~100/day,
with a per-address flag that moves entries to the invite block — plus a deep
link to the members page, and mark-drained clears the entries. The app never
sends or writes anything; the swap points for a future mechanism are the drain
block and `MEMBERS_URL` in `src/backend.js`. The self-serve join link survives
as a demoted secondary fallback on the single-add screen (ADR 0002). Flow 2's
broadcast follows the same handoff pattern: a confirmed mailto to the group's
own address (`handOffBroadcast()` in `src/backend.js`), deliberately NOT
queued — the on-screen confirm step is the retry, and a parked broadcast must
not sit in the add queue. There is no live member count (consumer Groups have
no API), and roster CSV sync is deliberately NOT built (captain decision,
2026-08-18 — Google's own duplicate rejection covers dedupe); the empty local
roster stub drives the broadcast CTA/kicker and the batch dupe line.
Flow 4 (save a contact) keeps a local-only contact book in `src/contacts.js`
(same localStorage approach as the queue; nothing leaves the device — see
`docs/adr/0003-device-local-contact-book.md`). Flow 3 (add a community Luma
event) is the credential-free design: read-only GETs of public lu.ma pages
for preview + best-effort dedupe (`src/luma.js` pure parsers,
`tauri-plugin-http` scoped to luma.com/lu.ma), and the add itself is a
handoff into Luma's own Add Event panel — the app never writes anywhere;
`handOffLuma()` in `src/backend.js` is the swap point, and the group
calendar's slug is the `GROUP_CALENDAR` constant there (see
`docs/adr/0004-credential-free-luma-handoff.md`). Home's next-event card
renders from that same credential-free calendar read
(`fetchCalendarEvents()`, one GET per Home entry): pure helpers in
`src/luma.js` pick the soonest not-ended event and render the date range,
venue, RSVP count, and days-out chip; the last successful read is cached
in localStorage (`bgn.calendar.v1`) so a venue-door cold start on bad
wifi shows the last known event, marked as such. RSVPs render only when
the public surface carries them; the capacity tile is omitted — the
surface carries no capacity number (`ticket_count` mirrors
`guest_count`), so it would have to be faked. The card is tappable and
opens the Events page — a separate scrollable list of ALL upcoming events
from the same read + cache, one fresh GET per page entry, same honest
stale/empty states (captain rejected expand-in-place on the card;
`docs/adr/0008-events-page.md`). The agent flow renders as
a stub; the batch dupe check uses the same empty roster stub. Screen 3
(scan) is deliberately unbuilt: README open question 1 was answered no
(captain decision, 2026-08-18 — batch paste is enough), so it stays
unreachable.

The in-app self-updater (`docs/adr/0007-in-app-self-updater.md`, captain
decision 2026-08-30) checks the PUBLIC repo's GitHub Releases anonymously —
one throttled fire-and-forget GET of `releases/latest` per Home entry,
never blocking, silent on failure — and offers only a strictly newer
`vX.Y.Z` release whose `bgn-coordinator_<X.Y.Z>_arm64.apk` asset matches
the tag. The download buffers fully before `tauri-plugin-fs` writes it to
the app cache dir (capability-scoped to that one file), and a
`JavascriptInterface` in MainActivity.kt hands it to Android's installer
via FileProvider — Android's own signature check is the integrity story,
the app verifies nothing. Swap points: `LATEST_URL`/`ASSET_RE` in
`src/updater.js` and the `BgnInstaller` bridge.

## Build

- Frontend: `npm install && npm run build` (Vite, output in `dist/`).
- Frontend tests: `npm test` (node:test; covers the pure validation/parse,
  the join-link + broadcast compose logic, the capture/drain queue
  (batching, mark-drained, daily budget), the Luma extraction/dedupe
  chain against fabricated fixtures, the release workflow's version/tag
  gate run against stubbed `gh`/`git`, and the updater's decide logic
  (parse/compare, offer/no-offer) against fabricated release bodies —
  no browser or network needed).
- CI: `.github/workflows/ci.yml` (PRs + pushes to main) runs frontend
  lint/format/build/test and host-target `cargo fmt --check` /
  `clippy -- -D warnings` / `cargo check` (installs the Tauri 2 Linux desktop
  libs first). Lint/format is eslint + prettier over `src/` and `test/` only
  (`npm run lint`, `npm run format:check`); the generated `support.js` and
  the prototype `ios-frame.jsx` are excluded.
- Release: `.github/workflows/release.yml` (pushes to main + workflow_dispatch)
  builds the SIGNED release arm64 APK and attaches it to a GitHub Release
  tagged from the Tauri config version. Merge without a version bump = green
  skip. Version/versionCode convention, the signing keystore, and the stable
  updater contract (tag `vX.Y.Z`, asset `bgn-coordinator_<X.Y.Z>_arm64.apk`)
  are documented in `docs/adr/0006-release-pipeline.md` — keep both stable,
  the in-app self-updater parses them (`docs/adr/0007-in-app-self-updater.md`).
- Emulator: AVDs `fm-contacts` and `skydash-smoke` (`emulator -list-avds`).
  Several agents may verify concurrently — boot your own instance on a free
  port (`emulator -avd <name> -port <unique> -no-window -no-audio
  -no-boot-anim -gpu swiftshader_indirect`) and target it with
  `adb -s emulator-<port>`.
- Rust, host check: desktop `cargo check` does NOT pass on this machine — the
  Linux desktop stack (libdbus, webkit2gtk-4.1, gtk3) is not installed. Use
  `cargo check --target aarch64-linux-android` in `src-tauri/` instead, with
  the NDK toolchain on PATH (`export PATH=/home/griswald/Android/Sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH`)
  — `ring` (via tauri-plugin-http → reqwest) needs its C compiler; `tauri
  android build` sets this up itself.
- APK: `ANDROID_HOME=/home/griswald/Android/Sdk NDK_HOME=/home/griswald/Android/Sdk/ndk/27.2.12479018 npx tauri android build --apk`.
  That builds a RELEASE APK — unsigned unless `ANDROID_KEYSTORE_FILE` and its
  passwords are in the environment (`docs/adr/0006-release-pipeline.md`); add
  `--debug` for an installable one (via npm: `npm run android:build -- --debug`,
  the `--` is required or the flag never reaches tauri).
  The system `java` is a JRE (no `javac`), so Gradle fails with
  "does not provide the required capabilities: [JAVA_COMPILER]" unless
  `JAVA_HOME` points at a JDK — the Gradle-provisioned one works:
  `JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2`.
- Icons: all app/launcher icons regenerate from committed sources with
  `npx tauri icon icon-manifest.json`: `app-icon.png` (square master for
  legacy mipmaps + desktop/iOS), `app-icon-fg.png` (adaptive foreground with
  the badge pre-scaled into the 66/108 adaptive safe zone — keep
  `android_fg_scale: 100` in the manifest) and `app-icon-bg.png` (plain
  off-white). It writes `src-tauri/icons/`, every Android mipmap incl.
  `ic_launcher_background.png`, and `mipmap-anydpi-v26/ic_launcher.xml`.
  The art is the group website's 64px badge favicon upscaled (palette-snap
  cleanup → Lanczos → light unsharp; no larger or vector source exists),
  so regen from the committed masters, never from a fresh 64px fetch.
  Rendered size/mask preview: `docs/icon-preview.png` — its adaptive tiles
  are cropped to the launcher's visible inner 72/108 viewport, not the full
  108dp layer, or they understate the on-device size by ~1.5x. The Android Studio
  template vectors `res/drawable/ic_launcher_background.xml` and
  `res/drawable-v24/ic_launcher_foreground.xml` were deleted as unreferenced;
  a `tauri android init` regen restores them harmlessly.
- `src-tauri/gen/android` is generated (`npx tauri android init`) and committed,
  like skydash-app. Six files in it are hand-patched or hand-added, so a regen
  silently clobbers them: `AndroidManifest.xml` (portrait-only per the spec,
  `allowBackup="false"` + `dataExtractionRules` so the device-local contact
  book never leaves the device, and the self-updater's
  `REQUEST_INSTALL_PACKAGES` permission), `res/xml/data_extraction_rules.xml`
  (hand-added; excludes everything, incl. the WebView `app_webview` store, from
  cloud backup and Android 12+ device transfer), `MainActivity.kt` (pads
  content by the system-bar insets instead of the generated
  `enableEdgeToEdge()`, and registers the self-updater's `BgnInstaller`
  JavascriptInterface from `onWebViewCreate` — the FileProvider already in the
  manifest serves the cached APK to Android's installer; ADR 0007),
  `res/values/themes.xml` (`windowLightStatusBar` for the light page
  background), `app/build.gradle.kts` (release `signingConfigs` block reading
  the keystore from the environment — `docs/adr/0006-release-pipeline.md`),
  and `app/proguard-rules.pro` (R8 keep rule for the installer bridge's
  `@JavascriptInterface` methods — release minify strips them otherwise).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
