# 1. Coordinator App ships as a Tauri 2 Android shell, not a PWA

Date: 2026-08-15

## Status

Accepted (captain decision, 2026-08-15).

## Context

The Coordinator App spec (the `README.md` handoff on the `main` branch of the
captain's working copy) was written platform-neutral and lists "React Native /
Expo" as the natural choice with "a mobile web PWA" as an acceptable fallback.
This repo previously held a retired email-collector PWA.

The captain decided on 2026-08-15 that the Coordinator App is a **Tauri 2
Android WebView shell**, following the same pattern as the skydash-app project
(`src-tauri/` Cargo project + `tauri.conf.json` + generated `gen/android`
Gradle project).

One deliberate difference from skydash-app: skydash points its WebView at a
remote URL; this app **bundles its own local frontend** (`frontendDist` →
`../dist`), because coordinators use it standing at a venue door on possibly
bad wifi.

## Decision

- The app is a Tauri 2 project; Android is the target platform.
- The frontend is built and bundled into the APK; it must work offline.
- This ADR amends the PWA / "pick the framework that fits" delivery assumption
  in the spec. The committed spec files themselves are not edited.

## Consequences

- The retired email-collector PWA files (`index.html` app shell, `app.js`,
  `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `make_icons.py`)
  were removed; service-worker offline caching is replaced by the bundled APK.
- Builds need the Rust + Android toolchains (NDK, cargo android targets)
  instead of a static web host.
- iOS is out of scope for this shell; the spec's iPhone-bezel design files are
  viewing scaffolding only.
