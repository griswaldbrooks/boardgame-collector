// The self-updater's decide logic against fabricated releases/latest bodies —
// fake repo, fake versions, fake assets; nothing here touches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTag,
  isNewer,
  decideUpdate,
  checkOutcome,
  recordCheck,
  lastCheck,
  CHECK_KEY,
} from "../src/updater.js";

/** A fabricated releases/latest body in the GitHub shape. */
function release(tag, assetNames = []) {
  return {
    tag_name: tag,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url: `https://example.invalid/fake/${name}`,
    })),
  };
}

const APK = (v) => `bgn-coordinator_${v}_arm64.apk`;

test("parseTag accepts only plain vX.Y.Z", () => {
  assert.deepEqual(parseTag("v0.1.0"), [0, 1, 0]);
  assert.deepEqual(parseTag("v12.345.6789"), [12, 345, 6789]);
  for (const bad of [
    "0.1.0", // missing v
    "v0.1.0-beta.1", // suffix
    "v0.1",
    "v0.1.0.1",
    "vx.y.z",
    "",
    null,
    undefined,
  ]) {
    assert.equal(parseTag(bad), null, `${bad} should not parse`);
  }
});

test("isNewer is strict semver order, and equal is not newer", () => {
  assert.ok(isNewer([0, 1, 1], [0, 1, 0])); // patch
  assert.ok(isNewer([0, 2, 0], [0, 1, 9])); // minor beats patches
  assert.ok(isNewer([1, 0, 0], [0, 9, 9])); // major beats everything
  assert.ok(!isNewer([0, 1, 0], [0, 1, 0])); // equal
  assert.ok(!isNewer([0, 1, 0], [0, 1, 1])); // older
  assert.ok(!isNewer([0, 9, 9], [1, 0, 0]));
});

test("a strictly newer release with its APK is offered", () => {
  const latest = release("v0.2.0", [APK("0.2.0")]);
  assert.deepEqual(decideUpdate(latest, "0.1.0"), {
    version: "0.2.0",
    url: `https://example.invalid/fake/${APK("0.2.0")}`,
  });
});

test("equal and older releases are never offered", () => {
  assert.equal(decideUpdate(release("v0.1.0", [APK("0.1.0")]), "0.1.0"), null);
  assert.equal(decideUpdate(release("v0.0.9", [APK("0.0.9")]), "0.1.0"), null);
});

test("a newer tag without a matching APK is no offer", () => {
  assert.equal(decideUpdate(release("v0.2.0", []), "0.1.0"), null);
  assert.equal(decideUpdate(release("v0.2.0"), "0.1.0"), null); // no assets key
  assert.equal(
    decideUpdate(release("v0.2.0", ["source.tar.gz"]), "0.1.0"),
    null,
  );
  // Asset shape right but its embedded version disagrees with the tag:
  // the pipeline cuts both from one version, so refuse rather than guess.
  assert.equal(decideUpdate(release("v0.2.0", [APK("0.1.9")]), "0.1.0"), null);
});

test("the matching asset wins among several", () => {
  const latest = release("v0.3.0", [
    "bgn-coordinator_0.3.0_arm64.apk.sha256",
    APK("0.3.0"),
  ]);
  const offer = decideUpdate(latest, "0.1.0");
  assert.equal(offer.version, "0.3.0");
  assert.match(offer.url, /bgn-coordinator_0\.3\.0_arm64\.apk$/);
});

test("unreadable input fails closed", () => {
  assert.equal(decideUpdate(null, "0.1.0"), null); // repo has no releases yet
  assert.equal(decideUpdate({}, "0.1.0"), null);
  assert.equal(
    decideUpdate(release("v0.2.0-beta.1", [APK("0.2.0")]), "0.1.0"),
    null,
  );
  assert.equal(
    decideUpdate(release("v0.2.0", [APK("0.2.0")]), "garbage"),
    null,
  );
});

/* --------------------------- last-check readout --------------------------- */
// The version-footer readout (docs/adr/0009): one plain string per check
// path, so a silent failure stops being undiagnosable.

test("checkOutcome names every path in one plain string", () => {
  assert.equal(
    checkOutcome({ offer: { version: "9.9.9" } }),
    "update available",
  );
  assert.equal(checkOutcome({ offer: null }), "up to date");
  assert.equal(checkOutcome({}), "up to date");

  const http = (status) => Object.assign(new Error(`HTTP ${status}`), {});
  // The failure that started this: anonymous GitHub answers an exhausted
  // rate limit with 403, and the newer secondary limits with 429.
  assert.equal(checkOutcome({ error: http(403) }), "blocked: rate limit");
  assert.equal(checkOutcome({ error: http(429) }), "blocked: rate limit");
  assert.equal(checkOutcome({ error: http(500) }), "blocked: HTTP 500");
  assert.equal(checkOutcome({ error: http(404) }), "blocked: HTTP 404");

  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.equal(checkOutcome({ error: abort }), "timed out");

  assert.equal(
    checkOutcome({ error: new TypeError("Load failed") }),
    "no network",
  );
  assert.equal(checkOutcome({ error: new Error("") }), "no network");
});

test("the readout round-trips, and unreadable storage is just no readout", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  assert.equal(lastCheck(), null, "nothing recorded yet");

  recordCheck("blocked: rate limit", 1756000000000);
  assert.deepEqual(lastCheck(), {
    at: 1756000000000,
    outcome: "blocked: rate limit",
  });

  store.set(CHECK_KEY, "not json");
  assert.equal(lastCheck(), null);
  delete globalThis.localStorage;
  assert.doesNotThrow(() => recordCheck("up to date"));
  assert.equal(lastCheck(), null);
});
