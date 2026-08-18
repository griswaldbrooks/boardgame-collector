// The contact book (Flow 4) is private and on-device: it starts empty,
// keeps entries newest-first, and survives kill/relaunch. localStorage is
// stubbed here, same stand-in as queue.test.js — nothing leaves the process.

import test from "node:test";
import assert from "node:assert/strict";
import { rowOf } from "../src/contacts.js";

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
