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
  fetchLatestRelease,
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
  // Nothing newer on the server is genuinely up to date...
  assert.equal(
    checkOutcome({
      offer: null,
      latest: release("v0.1.0", [APK("0.1.0")]),
      currentVersion: "0.1.0",
    }),
    "up to date",
  );
  // ...but a newer tag decideUpdate refused for want of its APK is not: the
  // workflow publishes the tag before the asset upload lands.
  const pending = release("v0.2.0", ["source.tar.gz"]);
  assert.equal(decideUpdate(pending, "0.1.0"), null, "still no offer");
  assert.equal(
    checkOutcome({
      offer: decideUpdate(pending, "0.1.0"),
      latest: pending,
      currentVersion: "0.1.0",
    }),
    "release found, no matching APK",
  );

  const http = (status) => Object.assign(new Error(`HTTP ${status}`), {});
  // The failure that started this: anonymous GitHub answers an exhausted
  // rate limit with 403, and the newer secondary limits with 429.
  assert.equal(checkOutcome({ error: http(403) }), "blocked: rate limit");
  assert.equal(checkOutcome({ error: http(429) }), "blocked: rate limit");
  assert.equal(checkOutcome({ error: http(500) }), "blocked: HTTP 500");
  assert.equal(checkOutcome({ error: http(404) }), "blocked: HTTP 404");

  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.equal(checkOutcome({ error: abort }), "timed out");
  // The http plugin's rejection shape is not ours to depend on, so the
  // timeout is flagged by fetchLatestRelease itself.
  assert.equal(
    checkOutcome({ error: Object.assign(new Error("x"), { timedOut: true }) }),
    "timed out",
  );

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

// The failure that made this readout necessary was a silent one being
// misdiagnosed, so the 10s timeout must not depend on the http plugin
// rejecting with a conventionally-named AbortError — it does not promise to.
test("a timed-out check reads as timed out whatever the fetch rejects with", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const realFetch = globalThis.fetch;
  globalThis.window = {};
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () =>
        reject(new Error("request failed")),
      ),
    );
  try {
    const pending = fetchLatestRelease();
    t.mock.timers.tick(10_000);
    const error = await pending.then(
      () => null,
      (e) => e,
    );
    assert.equal(checkOutcome({ error }), "timed out");
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.window;
  }
});
