// Store-and-forward queue (ADR 0002): a handoff the OS never accepted must
// stay pending across an app restart. localStorage and the WebView's
// `window.location.href = mailto:` are stubbed here — nothing is sent.

import test from "node:test";
import assert from "node:assert/strict";
import { JOIN_LINK } from "../src/backend.js";

// Survives module reloads, like the device's localStorage survives a restart.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
};

let handed = [];
let mailAppMissing = false;
globalThis.window = {
  location: {
    set href(uri) {
      if (mailAppMissing) throw new Error("no app can handle mailto:");
      handed.push(uri);
    },
  },
};

// A cold start: fresh module state, same persisted queue.
const relaunch = () =>
  import(`../src/queue.js?run=${store.size}-${handed.length}`);

test("a handoff the OS refuses stays queued across a restart", async () => {
  const app = await relaunch();
  app.enqueue({ kind: "one", email: "alex@example.com" });

  mailAppMissing = true; // airplane-mode stand-in: the handoff never lands
  await app.forward();
  assert.equal(handed.length, 0);
  assert.equal(
    JSON.parse(store.get("bgn.adds.v1")).length,
    1,
    "intent kept pending",
  );

  // Kill and relaunch, then submit again with a mail app available.
  const restarted = await relaunch();
  mailAppMissing = false;
  await restarted.forward();
  assert.match(handed[0], /^mailto:alex%40example\.com\?/);
  assert.ok(handed[0].includes(encodeURIComponent(JOIN_LINK)));
  assert.deepEqual(
    JSON.parse(store.get("bgn.adds.v1")),
    [],
    "drained once handed off",
  );
});

test("a batch add hands the coordinator's mail app one BCC'd message", async () => {
  const app = await relaunch();
  handed = [];
  app.enqueue({ kind: "batch", emails: ["jo@example.com", "sam@example.com"] });
  await app.forward();
  assert.equal(handed.length, 1, "one message, not one per address");
  assert.ok(
    handed[0].startsWith("mailto:?bcc=jo%40example.com,sam%40example.com"),
  );
  assert.deepEqual(JSON.parse(store.get("bgn.adds.v1")), []);
});
