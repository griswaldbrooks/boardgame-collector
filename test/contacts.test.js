// The contact book (Flow 4) is private and on-device: it starts empty,
// keeps entries newest-first, and survives kill/relaunch. localStorage is
// stubbed here, same stand-in as queue.test.js — nothing leaves the process.

import test from "node:test";
import assert from "node:assert/strict";
import { rowOf } from "../src/contacts.js";
import { parseBackup } from "../src/backup.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
};

let starts = 0;
// A cold start: fresh module state, same persisted book.
const relaunch = () => import(`../src/contacts.js?start=${++starts}`);

const venue = {
  name: "Fixture Venue",
  email: "",
  phone: "",
  notes: "",
  tag: "🏛️ Venue",
};
const sponsor = {
  name: "Fixture Sponsor",
  email: "",
  phone: "",
  notes: "",
  tag: "💰 Sponsor",
};

test("starts empty; saves newest-first; survives kill/relaunch", async () => {
  const app = await relaunch();
  assert.deepEqual(app.listContacts(), []);

  app.saveContact(venue);
  app.saveContact(sponsor);

  const restarted = await relaunch();
  const rows = restarted.listContacts();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Fixture Sponsor", "last saved renders first");
  assert.equal(rows[1].name, "Fixture Venue");
});

test("a name-only contact is a complete entry", async () => {
  const app = await relaunch();
  app.saveContact({
    name: "Name Only",
    email: "",
    phone: "",
    notes: "",
    tag: "🙋 Volunteer",
  });
  const [c] = app.listContacts();
  assert.equal(c.name, "Name Only");
  assert.equal(c.tag, "🙋 Volunteer");
  assert.ok(c.ts > 0);
});

test("saving a contact never touches the mailing-list queue", async () => {
  const app = await relaunch();
  app.saveContact(venue);
  assert.equal(store.has("bgn.adds.v1"), false);
});

test("rowOf: emoji from the tag; second line falls back notes → email → phone", () => {
  assert.equal(rowOf({ ...venue, notes: "note" }).icon, "🏛️");
  assert.equal(
    rowOf({ ...venue, name: "Fixture Venue" }).name,
    "Fixture Venue",
  );
  assert.equal(
    rowOf({ ...venue, notes: "note", email: "a@example.com", phone: "1" }).note,
    "note",
  );
  assert.equal(
    rowOf({ ...venue, email: "a@example.com", phone: "1" }).note,
    "a@example.com",
  );
  assert.equal(rowOf({ ...venue, phone: "617-555-0148" }).note, "617-555-0148");
  assert.equal(rowOf(venue).note, "");
});

test("saving a contact writes a backup; a broken bridge never breaks the save", async () => {
  const files = new Map();
  globalThis.BgnBackup = {
    write: (name, json) => (files.set(name, json), null),
    list: () => JSON.stringify([...files.keys()]),
    read: (name) => files.get(name) ?? null,
    remove: (name) => files.delete(name),
  };
  store.clear();
  try {
    const app = await relaunch();
    app.saveContact(venue);
    assert.equal(files.size, 1, "one dated copy in shared storage");
    const [saved] = JSON.parse([...files.values()][0]);
    assert.equal(saved.name, "Fixture Venue");

    globalThis.BgnBackup.write = () => {
      throw new Error("no storage");
    };
    assert.doesNotThrow(() => app.saveContact(sponsor));
    assert.equal(app.listContacts().length, 2, "the save still landed");
  } finally {
    delete globalThis.BgnBackup;
  }
});

test("importing a backup only ever adds", async () => {
  store.clear();
  const app = await relaunch();
  app.saveContact(venue);
  const book = app.listContacts();
  assert.equal(app.importContacts(book), 0, "the same entries are duplicates");
  assert.equal(app.importContacts([{ ...sponsor, ts: 1 }]), 1);
  assert.deepEqual(
    app.listContacts().map((c) => c.name),
    ["Fixture Venue", "Fixture Sponsor"],
    "the imported entry sorts by its own older timestamp",
  );
});

// What the restore card promises is what a restore adds: the merge collapses
// entries identical on everything the coordinator typed, so a file holding
// the same contact twice must count as one, not two.
test("a file with duplicate entries restores as one contact", async () => {
  store.clear();
  const app = await relaunch();
  const file = [
    { ...venue, ts: 10 },
    { ...venue, ts: 20 },
    { ...sponsor, ts: 30 },
  ];
  assert.equal(app.importContacts(file), 2, "the duplicate collapses");
  assert.deepEqual(
    app.listContacts().map((c) => c.name),
    ["Fixture Sponsor", "Fixture Venue"],
  );
});

// The picker takes any file, so an entry without a tag could once reach the
// book and break every later render of the saved list — permanently, there
// being no delete. parseBackup is the gate both read paths go through.
test("a file that fails the contact contract never reaches the book", async () => {
  store.clear();
  const app = await relaunch();
  app.saveContact(venue);

  const { tag: _tag, ...untagged } = sponsor;
  assert.equal(
    parseBackup(JSON.stringify([untagged])),
    null,
    "an untagged entry is not a backup",
  );
  app.importContacts(parseBackup(JSON.stringify([untagged])));

  assert.deepEqual(
    app.listContacts().map((c) => c.name),
    ["Fixture Venue"],
  );
  assert.doesNotThrow(() => app.listContacts().map(rowOf));
});
