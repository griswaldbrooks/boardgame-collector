// Device-local capture queue (ADR 0005): door submissions queue offline and
// survive a kill/relaunch, the drain presents a defensively capped FIFO
// batch, and markDrained clears exactly the drained entries and counts them
// against the ~100/day budget. localStorage is stubbed — nothing leaves the
// machine, and the flow touches no network at all.

import test from "node:test";
import assert from "node:assert/strict";

// Survives module reloads, like the device's localStorage survives a restart.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
};

let run = 0;
// A cold start: fresh module state, same persisted queue.
const relaunch = () => import(`../src/queue.js?run=${run++}`);
const reset = () => store.clear();

test("door submissions queue locally and survive a kill/relaunch", async () => {
  reset();
  const app = await relaunch();
  app.enqueue({ kind: "one", email: "alex@example.com", name: "Alex" });
  app.enqueue({ kind: "batch", emails: ["jo@example.com", "sam@example.com"] });

  // Offline the whole time — there is no handoff to attempt any more.
  const restarted = await relaunch();
  assert.deepEqual(
    restarted.pendingAddresses(),
    ["alex@example.com", "jo@example.com", "sam@example.com"],
    "capture order survives the restart",
  );
});

test("the drain batch is capped at 100; the rest stays queued", async () => {
  reset();
  const app = await relaunch();
  app.enqueue({
    kind: "batch",
    emails: Array.from({ length: 130 }, (_, i) => `guest${i}@example.com`),
  });

  const restarted = await relaunch();
  assert.equal(restarted.DRAIN_LIMIT, 100);
  assert.equal(
    restarted.nextBatch().length,
    100,
    "no mega-batch that could trip the throttle",
  );
  assert.equal(
    restarted.pendingAddresses().length,
    130,
    "the rest waits for the next batch",
  );
});

test("markDrained clears drained entries, rewrites a split batch, keeps the rest", async () => {
  reset();
  const app = await relaunch();
  app.enqueue({ kind: "one", email: "alex@example.com" });
  app.enqueue({
    kind: "batch",
    emails: ["jo@example.com", "sam@example.com", "kim@example.com"],
  });

  app.markDrained(["alex@example.com", "jo@example.com"]);
  const restarted = await relaunch();
  assert.deepEqual(restarted.pendingAddresses(), [
    "sam@example.com",
    "kim@example.com",
  ]);
});

test("markDrained counts drained adds against today's ~100 budget", async () => {
  reset();
  const app = await relaunch();
  const emails = Array.from({ length: 105 }, (_, i) => `guest${i}@example.com`);
  app.enqueue({ kind: "batch", emails });
  app.markDrained(emails.slice(0, 100));

  assert.equal(app.drainedToday(), 100);
  assert.equal(app.remainingToday(), 0, "budget spent");
  const restarted = await relaunch();
  assert.deepEqual(restarted.nextBatch(), [], "nothing more presents today");
  assert.equal(
    restarted.pendingAddresses().length,
    5,
    "the rest is queued for tomorrow",
  );
});

test("markDrained ignores addresses that were never queued", async () => {
  reset();
  const app = await relaunch();
  app.enqueue({ kind: "one", email: "alex@example.com" });
  app.markDrained(["ghost@example.com"]); // not in the queue
  assert.equal(app.drainedToday(), 0, "nothing removed, nothing counted");
  assert.deepEqual(app.pendingAddresses(), ["alex@example.com"]);
});

test("the budget resets with the day", async () => {
  reset();
  store.set("bgn.drainlog.v1", JSON.stringify({ day: "1999-1-1", n: 100 }));
  const app = await relaunch();
  assert.equal(app.drainedToday(), 0, "yesterday's tally does not carry over");
  assert.equal(app.remainingToday(), app.DRAIN_LIMIT);
});
