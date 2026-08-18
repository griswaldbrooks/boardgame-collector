// The private contact book (Flow 4). Local and on-device only
// (docs/adr/0003-device-local-contact-book.md) — same persistence approach as
// the add queue (localStorage survives kill/relaunch). Deliberately separate
// from the mailing-list queue/roster:
// nothing here ever reaches backend.js's share/mail machinery, so the
// privacy banner's promise holds by construction.

const KEY = "bgn.contacts.v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

// Newest first, matching how the saved list renders.
export function saveContact(c) {
  localStorage.setItem(
    KEY,
    JSON.stringify([{ ...c, ts: Date.now() }, ...load()]),
  );
}

export function listContacts() {
  return load();
}

// Row model for the saved list: the emoji is the tag's leading token; the
// second line falls back notes → email → phone, so a phone-only contact
// still reads as something.
export function rowOf(c) {
  return {
    icon: c.tag.split(" ")[0],
    name: c.name,
    note: c.notes || c.email || c.phone || "",
  };
}
