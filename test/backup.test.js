// Contact-book backup (docs/adr/0009): the dated naming, the prune window,
// and the import merge. Every contact here is fabricated — no real contact
// data lives in this repo — and the shared-storage bridge is a stub, so
// nothing touches the filesystem or the network.

import test from "node:test";
import assert from "node:assert/strict";
import {
  FILE_RE,
  KEEP,
  backupName,
  toPrune,
  newestBackup,
  mergeContacts,
  parseBackup,
} from "../src/backup.js";

const fake = (name, over = {}) => ({
  name,
  email: "",
  phone: "",
  notes: "",
  tag: "🏛️ Venue",
  ts: 1000,
  ...over,
});

test("backupName is the dated, sortable file name", () => {
  assert.equal(
    backupName(new Date(2026, 8, 4, 7, 5)),
    "bgn-contacts-2026-09-04-0705.json",
  );
  assert.equal(
    backupName(new Date(2026, 11, 31, 23, 59)),
    "bgn-contacts-2026-12-31-2359.json",
  );
  assert.ok(FILE_RE.test(backupName(new Date(2026, 0, 1, 0, 0))));
});

test("plain name order is chronological order", () => {
  const names = [
    backupName(new Date(2026, 8, 4, 9, 0)),
    backupName(new Date(2026, 8, 4, 10, 0)),
    backupName(new Date(2026, 9, 1, 8, 0)),
  ];
  assert.deepEqual([...names].sort(), names);
});

test("toPrune keeps the newest KEEP and drops the rest", () => {
  const names = Array.from({ length: 8 }, (_, i) =>
    backupName(new Date(2026, 8, 4, 9, i)),
  );
  const prune = toPrune(names.slice().reverse());
  assert.equal(prune.length, 8 - KEEP);
  assert.deepEqual(prune, names.slice(0, 8 - KEEP), "the oldest go");
  assert.deepEqual(toPrune(names.slice(0, KEEP)), [], "nothing to prune yet");
});

test("pruning never touches files that are not ours", () => {
  const mine = Array.from({ length: 7 }, (_, i) =>
    backupName(new Date(2026, 8, 4, 9, i)),
  );
  const others = ["invoice.pdf", "bgn-contacts.json", "notes-2026-09-04.json"];
  const prune = toPrune([...others, ...mine]);
  assert.deepEqual(prune, mine.slice(0, 2));
  for (const name of others) assert.ok(!prune.includes(name));
});

test("newestBackup picks the latest dated file, ignoring strangers", () => {
  const older = backupName(new Date(2026, 8, 4, 9, 0));
  const newer = backupName(new Date(2026, 8, 4, 21, 30));
  assert.equal(newestBackup([newer, "zzz.json", older]), newer);
  assert.equal(newestBackup(["zzz.json"]), null);
  assert.equal(newestBackup([]), null);
});

test("merge drops identical entries and keeps the book newest-first", () => {
  const book = [fake("Fixture Venue", { ts: 30 })];
  const merged = mergeContacts(book, [
    fake("Fixture Venue", { ts: 5 }), // identical apart from the timestamp
    fake("Fixture Sponsor", { ts: 20, tag: "💰 Sponsor" }),
  ]);
  assert.deepEqual(
    merged.map((c) => c.name),
    ["Fixture Venue", "Fixture Sponsor"],
  );
});

test("an import never overwrites what is already in the book", () => {
  const book = [fake("Fixture Venue", { notes: "edited in the app", ts: 99 })];
  const merged = mergeContacts(book, [
    fake("Fixture Venue", { notes: "stale backup note", ts: 1 }),
  ]);
  assert.equal(merged.length, 2, "a differing entry is added, not merged over");
  assert.equal(merged[0].notes, "edited in the app", "the in-app copy wins");
  assert.deepEqual(book, [
    fake("Fixture Venue", { notes: "edited in the app", ts: 99 }),
  ]);
});

test("merge skips junk entries and undated ones still land", () => {
  const merged = mergeContacts([], [null, {}, { name: "" }, fake("Kept")]);
  assert.deepEqual(
    merged.map((c) => c.name),
    ["Kept"],
  );
  const [c] = mergeContacts([], [{ name: "No Timestamp" }]);
  assert.ok(c.ts > 0, "an entry with no ts still sorts");
});

test("re-importing the same backup twice adds nothing the second time", () => {
  const file = [fake("Fixture Venue"), fake("Fixture Sponsor")];
  const once = mergeContacts([], file);
  assert.deepEqual(mergeContacts(once, file), once);
});

test("parseBackup accepts a contact array and nothing else", () => {
  assert.deepEqual(parseBackup(JSON.stringify([fake("A")]))?.length, 1);
  assert.deepEqual(parseBackup("[]"), []);
  for (const bad of [
    "",
    "{}",
    "not json",
    '["a"]',
    '[{"email":"x"}]',
    "null",
  ]) {
    assert.equal(parseBackup(bad), null, `${bad} is not a backup`);
  }
});

/* --------------------- the bridge, stubbed end to end --------------------- */
// A stand-in for MainActivity's BgnBackup: an in-memory folder, so the
// write/prune/read path is exercised without Android.

function stubBridge(files = new Map(), fail = null) {
  return {
    files,
    write(name, json) {
      if (fail === "write") throw new Error("no storage");
      files.set(name, json);
      return null;
    },
    list: () => (fail === "list" ? "junk" : JSON.stringify([...files.keys()])),
    read: (name) => files.get(name) ?? null,
    remove: (name) => files.delete(name),
  };
}

const withBridge = async (bridge, fn) => {
  globalThis.BgnBackup = bridge;
  try {
    return await fn(await import("../src/backup.js"));
  } finally {
    delete globalThis.BgnBackup;
  }
};

test("a write lands a dated file and prunes past the keep window", async () => {
  const b = stubBridge(
    new Map(
      Array.from({ length: KEEP + 2 }, (_, i) => [
        backupName(new Date(2026, 0, 1, 0, i)),
        "[]",
      ]),
    ),
  );
  await withBridge(b, ({ writeBackup }) => writeBackup([fake("Fixture")]));
  assert.equal(b.files.size, KEEP, "the window holds after the new write");
  assert.ok(
    [...b.files.keys()].every((n) => FILE_RE.test(n)),
    "only dated files remain",
  );
});

test("an empty book is never written — a wipe must not prune real backups", async () => {
  const only = backupName(new Date(2026, 0, 1, 0, 0));
  const b = stubBridge(new Map([[only, JSON.stringify([fake("Fixture")])]]));
  await withBridge(b, ({ writeBackup }) => writeBackup([]));
  assert.deepEqual([...b.files.keys()], [only]);
});

test("backup failures are swallowed: a contact save never breaks", async () => {
  for (const fail of ["write", "list"]) {
    await withBridge(stubBridge(new Map(), fail), ({ writeBackup }) =>
      assert.doesNotThrow(() => writeBackup([fake("Fixture")])),
    );
  }
  // No bridge at all (bare-browser dev, pre-API-29 Android).
  const { writeBackup, readNewestBackup } = await import("../src/backup.js");
  assert.doesNotThrow(() => writeBackup([fake("Fixture")]));
  assert.equal(readNewestBackup(), null);
});

test("readNewestBackup returns the latest readable file, or null", async () => {
  const old = backupName(new Date(2026, 0, 1, 0, 0));
  const recent = backupName(new Date(2026, 5, 1, 12, 0));
  const b = stubBridge(
    new Map([
      [old, JSON.stringify([fake("Old")])],
      [recent, JSON.stringify([fake("Recent")])],
    ]),
  );
  await withBridge(b, ({ readNewestBackup }) => {
    const found = readNewestBackup();
    assert.equal(found.name, recent);
    assert.deepEqual(
      found.contacts.map((c) => c.name),
      ["Recent"],
    );
  });
  // An empty or corrupt newest file is no offer, not a crash.
  for (const body of ["[]", "not json"]) {
    await withBridge(
      stubBridge(new Map([[recent, body]])),
      ({ readNewestBackup }) => assert.equal(readNewestBackup(), null),
    );
  }
});
