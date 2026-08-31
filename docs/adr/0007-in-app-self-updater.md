# 7. In-app self-updater: anonymous GitHub Releases check + Android installer handoff

Date: 2026-08-30

## Status

Accepted (captain decision, 2026-08-30 — "option B", building on ADR 0006).

## Context

ADR 0006 gives every merge to main a signed arm64 APK on a GitHub Release,
with a stable machine contract (tag `vX.Y.Z`, asset
`bgn-coordinator_<X.Y.Z>_arm64.apk`). Coordinators run the app on their own
phones with no app store in the loop, so the app needs to notice a new
release, fetch it, and get it installed. The repo is PUBLIC, so the device
needs no credentials of any kind — and none may be added.

## Decision

The updater lives in `src/updater.js` (checks + download) and a small
install bridge in `src-tauri/gen/android/.../MainActivity.kt`.

**Where it checks.** One anonymous
`GET https://api.github.com/repos/griswaldbrooks/boardgame-collector/releases/latest`.
If the repo ever goes private, that breaks the updater silently and is a
separate project's problem.

**When.** On Home entry, fire-and-forget, throttled to at most one check per
five minutes while no offer is live. It never blocks startup or the
mailing-list flow, and network/HTTP failures are swallowed with a console
warning — bad venue wifi just means no update card this time. A 404 (repo
with no releases yet) is "nothing to offer", not an error.

**Guard rules.** An update is offered only when ALL hold; everything else
fails closed to no offer, never a guess:

- both the release tag and the app's own version parse as plain `vX.Y.Z` /
  `X.Y.Z` semver (a suffix is unreadable, per the ADR 0006 contract);
- the released version is STRICTLY newer — equal is not newer, mirroring the
  pipeline's downgrade guard client-side;
- the release carries an asset matching
  `^bgn-coordinator_(\d+\.\d+\.\d+)_arm64\.apk$` whose embedded version
  equals the tag's (the pipeline cuts both from one version; disagreement is
  unreadable).

Android's installer enforces the same rule a second way: a lower
`versionCode` is refused at install time.

**Download.** Anonymous GET of the matching asset's `browser_download_url`
(github.com, one redirect to objects.githubusercontent.com), streamed with a
byte-count progress readout. The body is buffered completely and only then
written to `$APPCACHE/bgn-update.apk` via tauri-plugin-fs — an interrupted
download can never leave a truncated APK behind. The capability scopes the
fs plugin to exactly that one file and the http plugin to the three GitHub
hosts.

**Install.** A `JavascriptInterface` registered from `onWebViewCreate` in
MainActivity takes a bare file name, resolves it in the app cache dir (JS
can never point the installer anywhere else), shares it through the app's
own FileProvider, and fires `ACTION_VIEW` with MIME
`application/vnd.android.package-archive`. The manifest's
`REQUEST_INSTALL_PACKAGES` permission makes Android show its
install-unknown-apps prompt on first use. Release builds keep the bridge
through R8 via a keep rule in `proguard-rules.pro`.

**Integrity is Android's job.** Release APKs are signed with the
persistent keystore (ADR 0006); the installer refuses an update signed by a
different key. The app deliberately performs no signature verification of its
own — and no automatic install: every update needs the coordinator's tap in
Android's installer.

## Consequences

- The capabilities file carries GitHub URLs in the http scope and a
  one-file fs write scope.
- Three more hand-patches under `src-tauri/gen/android` that a
  `tauri android init` regen clobbers: the manifest permission,
  MainActivity's installer bridge, and the proguard keep rule (AGENTS.md
  "Build" lists them).
- On-device install verification is deferred to the captain's sideload: the
  build host's AVDs are x86_64 and the release APK is arm64.
- Skipped on purpose: caching check results, release-notes rendering, a
  manual re-check action (leaving and re-entering Home re-checks), and any
  iOS equivalent (there is no iOS build).
