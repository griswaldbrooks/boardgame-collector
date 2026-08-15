# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## What this app is

Tauri 2 Android WebView shell (not a PWA — see `docs/adr/0001-tauri-2-not-pwa.md`),
following the skydash-app pattern but with the frontend bundled (`frontendDist`).
The design spec lives in `README.md` (handoff spec); flows are follow-up work.

## Build

- Frontend: `npm install && npm run build` (Vite, output in `dist/`).
- Rust, host check: desktop `cargo check` does NOT pass on this machine — the
  Linux desktop stack (libdbus, webkit2gtk-4.1, gtk3) is not installed. Use
  `cargo check --target aarch64-linux-android` in `src-tauri/` instead.
- APK: `ANDROID_HOME=/home/griswald/Android/Sdk NDK_HOME=/home/griswald/Android/Sdk/ndk/27.2.12479018 npx tauri android build --apk`.
  The system `java` is a JRE (no `javac`), so Gradle fails with
  "does not provide the required capabilities: [JAVA_COMPILER]" unless
  `JAVA_HOME` points at a JDK — the Gradle-provisioned one works:
  `JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2`.
- `src-tauri/gen/android` is generated (`npx tauri android init`) and committed,
  like skydash-app. Three files in it are hand-patched, so a regen silently
  clobbers them: `AndroidManifest.xml` (portrait-only per the spec),
  `MainActivity.kt` (pads content by the system-bar insets instead of the
  generated `enableEdgeToEdge()`), and `res/values/themes.xml`
  (`windowLightStatusBar` for the light page background).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
