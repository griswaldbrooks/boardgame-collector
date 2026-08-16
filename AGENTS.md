# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## What this app is

Tauri 2 Android WebView shell (not a PWA — see `docs/adr/0001-tauri-2-not-pwa.md`),
following the skydash-app pattern but with the frontend bundled (`frontendDist`).
The design spec lives in `README.md` (handoff spec).

Flow 1 (Home → Add to mailing list → Done), Flow 2 (Message the list), and
Flow 4 (Save a contact) are implemented in framework-free ES modules under
`src/`. The v1 add mechanism is the self-serve join link: the app composes the
join-link message and hands it to the coordinator's own apps (share sheet /
BCC mailto); it never sends anything itself — see
`docs/adr/0002-self-serve-join-link.md`. The single swap point for a future
mechanism is `handOff()` in `src/backend.js`, fed by the store-and-forward
queue in `src/queue.js`. Flow 2's broadcast follows the same pattern: a
confirmed mailto to the group's own address (`handOffBroadcast()` in
`src/backend.js`), deliberately NOT queued — the on-screen confirm step is the
retry, and a parked broadcast must not block join-link handoffs at the queue
head. There is no live member count (consumer Groups have no API): the empty
local roster stub drives the broadcast CTA/kicker once CSV roster sync lands.
Flow 4 (save a contact) keeps a local-only contact book in `src/contacts.js`
(same localStorage approach as the queue; nothing leaves the device — see
`docs/adr/0003-device-local-contact-book.md`). Flow 3 (add a community Luma
event) is the credential-free design: read-only GETs of public lu.ma pages
for preview + best-effort dedupe (`src/luma.js` pure parsers,
`tauri-plugin-http` scoped to luma.com/lu.ma), and the add itself is a
handoff into Luma's own Add Event panel — the app never writes anywhere;
`handOffLuma()` in `src/backend.js` is the swap point, and the group
calendar's slug is the `GROUP_CALENDAR` constant there (see
`docs/adr/0004-credential-free-luma-handoff.md`). The agent flow renders as
a stub; the batch dupe check uses the same empty roster stub. Screen 3
(scan) is deliberately unbuilt — it hangs on README open question 1.

## Build

- Frontend: `npm install && npm run build` (Vite, output in `dist/`).
- Frontend tests: `npm test` (node:test; covers the pure validation/parse,
  the join-link + broadcast compose logic, and the Luma extraction/dedupe
  chain against fabricated fixtures — no browser needed).
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
  The system `java` is a JRE (no `javac`), so Gradle fails with
  "does not provide the required capabilities: [JAVA_COMPILER]" unless
  `JAVA_HOME` points at a JDK — the Gradle-provisioned one works:
  `JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2`.
- `src-tauri/gen/android` is generated (`npx tauri android init`) and committed,
  like skydash-app. Four files in it are hand-patched or hand-added, so a regen
  silently clobbers them: `AndroidManifest.xml` (portrait-only per the spec,
  plus `allowBackup="false"` + `dataExtractionRules` so the device-local
  contact book never leaves the device), `res/xml/data_extraction_rules.xml`
  (hand-added; excludes everything, incl. the WebView `app_webview` store, from
  cloud backup and Android 12+ device transfer), `MainActivity.kt` (pads
  content by the system-bar insets instead of the generated
  `enableEdgeToEdge()`), and `res/values/themes.xml` (`windowLightStatusBar`
  for the light page background).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
