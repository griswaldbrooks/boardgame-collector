// The self-updater's decide logic against fabricated releases/latest bodies —
// fake repo, fake versions, fake assets; nothing here touches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTag, isNewer, decideUpdate } from "../src/updater.js";

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
