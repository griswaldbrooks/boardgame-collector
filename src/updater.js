// In-app self-updater (docs/adr/0007-in-app-self-updater.md): an anonymous
// read of the project's public GitHub Releases, a download of the signed
// arm64 APK, and a handoff to Android's own installer. The parse rules below
// ARE the release pipeline's machine contract (docs/adr/0006) — tag vX.Y.Z,
// one asset named bgn-coordinator_<X.Y.Z>_arm64.apk; keep them in sync.
//
// Integrity is Android's job, not ours: release APKs are signed with the
// persistent keystore, and the installer refuses an update that is not
// signed with the same key. The app deliberately does no signature checking
// of its own.

// No credentials, ever — the repo is public (captain decision; if it goes
// private the update mechanism is a separate project).
export const LATEST_URL =
  "https://api.github.com/repos/griswaldbrooks/boardgame-collector/releases/latest";

// Asset name from the release pipeline (ADR 0006 "Updater contract").
export const ASSET_RE = /^bgn-coordinator_(\d+\.\d+\.\d+)_arm64\.apk$/;

// The downloaded APK lives in the app cache dir under this name; the install
// bridge in MainActivity.kt reads it back from the same directory.
export const APK_NAME = "bgn-update.apk";

// "vX.Y.Z" -> [X, Y, Z]; anything else (suffixes, missing v, junk) -> null.
export function parseTag(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Strictly newer. Equal is not newer: the downgrade guard from the release
// pipeline (ADR 0006) mirrored client-side, so a stale or fiddled `latest`
// pointer can never talk a device into installing an older versionCode.
export function isNewer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Decide whether `latest` (a parsed releases/latest body, or null when the
// repo has no releases yet) is an update for a device on `currentVersion`.
// Returns { version, url } to offer, or null. Fails closed: an unparseable
// tag or a missing/mislabeled asset is no offer, never a guess.
export function decideUpdate(latest, currentVersion) {
  const current = parseTag(`v${currentVersion}`);
  const released = parseTag(latest?.tag_name);
  if (!current || !released || !isNewer(released, current)) return null;
  const version = latest.tag_name.slice(1);
  // The pipeline cuts tag and asset name from the same version; an asset
  // that embeds a different one is unreadable as far as we are concerned.
  for (const asset of latest.assets ?? []) {
    const m = ASSET_RE.exec(asset?.name ?? "");
    if (m?.[1] === version) return { version, url: asset.browser_download_url };
  }
  return null;
}

/* ------------------------- last-check readout ------------------------- */
// The check is deliberately silent (bad venue wifi must not nag), and that
// silence made a real failure undiagnosable: the home IP's anonymous GitHub
// rate limit was exhausted and the app simply never offered anything. So
// every path now records one plain string, revealed by tapping the version
// footer (docs/adr/0009). One string, no logging machinery.

export const CHECK_KEY = "bgn.updatecheck.v1";

// The outcome string for a finished check: pass the offer decideUpdate made
// (or null) along with the release body it read, or the error it threw.
// No offer has two very different causes — nothing newer, or a newer tag
// whose bgn-coordinator_<X.Y.Z>_arm64.apk asset is missing or misnamed (the
// release workflow uploads the asset after it publishes the tag). Reporting
// both as "up to date" while a newer version is live is the exact silence
// this readout exists to break, so they are named apart.
export function checkOutcome({ offer, error, latest, currentVersion } = {}) {
  if (!error) {
    if (offer) return "update available";
    const current = parseTag(`v${currentVersion}`);
    const released = parseTag(latest?.tag_name);
    return current && released && isNewer(released, current)
      ? "release found, no matching APK"
      : "up to date";
  }
  // fetchLatestRelease tags its own timeout: the http plugin's rejection
  // shape is not ours to depend on, and a timeout reported as "no network"
  // is exactly the wrong diagnosis this readout exists to prevent.
  if (error.timedOut || error.name === "AbortError") return "timed out";
  const status = /^HTTP (\d+)$/.exec(error.message ?? "")?.[1];
  // Anonymous GitHub answers an exhausted rate limit with 403 (429 under
  // the newer secondary limits) — the failure that started this.
  if (!status) return "no network";
  return status === "403" || status === "429"
    ? "blocked: rate limit"
    : `blocked: HTTP ${status}`;
}

export function recordCheck(outcome, at = Date.now()) {
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify({ at, outcome }));
  } catch {
    // A readout is not worth an exception.
  }
}

// { at, outcome } from the last check, or null when none has finished.
export function lastCheck() {
  try {
    const rec = JSON.parse(localStorage.getItem(CHECK_KEY));
    return typeof rec?.outcome === "string" ? rec : null;
  } catch {
    return null;
  }
}

/* ------------------------------ orchestration ------------------------------ */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";

// A browser fetch of api.github.com works (it sends CORS headers), but the
// APK download redirects to a CDN host — inside Tauri both requests go
// through the Rust-side http plugin (capability-scoped to GitHub).
const doFetch = (url, init) =>
  (window.__TAURI_INTERNALS__ ? tauriFetch : globalThis.fetch)(url, init);

const CHECK_TIMEOUT_MS = 10_000;

// The releases/latest body, or null when the repo has no releases yet
// (a 404). Throws on any other failure — callers swallow, the check must
// never surface an error or block anything.
export async function fetchLatestRelease() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await doFetch(LATEST_URL, {
      signal: ctrl.signal,
      headers: { accept: "application/vnd.github+json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (ctrl.signal.aborted)
      throw Object.assign(new Error("timed out"), { timedOut: true });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// The offered update ({ version, url }) or null, alongside the release body
// it was decided from — the readout needs to see a refused release, not just
// the absence of an offer.
export async function checkForUpdates(currentVersion) {
  const latest = await fetchLatestRelease();
  return {
    latest,
    offer: latest ? decideUpdate(latest, currentVersion) : null,
  };
}

// Download the APK into the app cache dir, reporting (received, total|null)
// as bytes arrive. The file is only written once the whole body is in hand,
// so an interrupted download can never leave a truncated APK behind for the
// installer to choke on.
export async function downloadUpdate(update, onProgress) {
  const res = await doFetch(update.url, {
    redirect: "follow",
    maxRedirections: 5, // github.com release URL -> objects.githubusercontent.com
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || null;
  const chunks = [];
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(received, total);
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  await writeFile(APK_NAME, bytes, { baseDir: BaseDirectory.AppCache });
}

// Hand the cached APK to Android's installer (FileProvider + ACTION_VIEW,
// MainActivity.kt). Android shows the install-unknown-apps prompt itself the
// first time. Throws a short message fit for the screen when the bridge is
// missing (bare-browser dev) or the file is not there.
export function installUpdate() {
  if (!window.BgnInstaller) throw new Error("installer unavailable");
  const err = window.BgnInstaller.installApk(APK_NAME);
  if (err) throw new Error(err);
}
