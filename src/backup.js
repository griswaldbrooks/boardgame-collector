// Automatic backup of the contact book to user-visible shared storage
// (docs/adr/0009-automatic-contact-backup.md). The book lives in
// localStorage, which an uninstall or an "app data clear" wipes — that
// wipe cost the captain a contact, and Android's own cloud backup stays
// deliberately off. So the app writes its own copy into
// Downloads/BGN Coordinator/ through the `BgnBackup` bridge in
// MainActivity.kt (MediaStore, API 29+, no permission and no network):
// still on the device, still nothing sent anywhere, but now it survives a
// reinstall and the coordinator can see and copy the file themselves.
//
// Everything here is fire-and-forget: no bridge (bare-browser dev, older
// Android) or a storage failure means no backup this time, never a broken
// contact save.

// bgn-contacts-YYYY-MM-DD-HHmm.json — dated, so plain name order is also
// newest-last order.
export const FILE_RE = /^bgn-contacts-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

// How many dated copies to keep; older ones are pruned after each write.
export const KEEP = 5;

const pad = (n) => String(n).padStart(2, "0");

export function backupName(d) {
  return (
    `bgn-contacts-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}.json`
  );
}

const dated = (names) => (names ?? []).filter((n) => FILE_RE.test(n)).sort();

// The backups to delete after a write: everything older than the newest
// `keep`. Files that aren't ours are never touched.
export function toPrune(names, keep = KEEP) {
  return dated(names).slice(0, -keep);
}

// Newest backup file name, or null when there is none.
export function newestBackup(names) {
  return dated(names).pop() ?? null;
}

// A contact's identity for dedupe: everything the coordinator typed. The
// timestamp is deliberately out — the same contact backed up and re-imported
// is one contact, not two.
const keyOf = (c) => JSON.stringify([c.name, c.email, c.phone, c.notes, c.tag]);

// Fold a backup's entries into the book. An import can only ADD: an entry
// identical to one already in the book is dropped, and nothing already in
// the book is ever overwritten by the file — the in-app copy always wins.
// Result stays newest-first, the order the saved list renders.
export function mergeContacts(current, incoming) {
  const seen = new Set(current.map(keyOf));
  const added = [];
  for (const c of incoming ?? []) {
    if (!c?.name || seen.has(keyOf(c))) continue;
    seen.add(keyOf(c));
    added.push({ ...c, ts: Number(c.ts) || Date.now() });
  }
  return [...current, ...added].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

// The contract the saved list renders against (rowOf in contacts.js): a
// name to show and a tag to take the emoji from, both strings. The picker
// hands us any file the coordinator taps, so a near-miss — a hand-edited
// backup with the tag stripped, an unrelated export that happens to carry
// names — must be rejected here rather than persisted into the book and
// then written back out over the good backups.
const isContact = (c) =>
  typeof c?.name === "string" && c.name !== "" && typeof c.tag === "string";

// A backup file's text -> the contact array, or null when it is not one.
export function parseBackup(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) && v.every(isContact) ? v : null;
  } catch {
    return null;
  }
}

/* ------------------------------ the bridge ------------------------------ */

const bridge = () => globalThis.BgnBackup ?? null;

// Write a dated copy and prune the old ones. Never throws. An empty book is
// never written: a launch or a clear-out must not push the real backups out
// of the keep window.
export function writeBackup(contacts) {
  try {
    const b = bridge();
    if (!b || !contacts?.length) return;
    b.write(backupName(new Date()), JSON.stringify(contacts));
    for (const name of toPrune(JSON.parse(b.list()))) b.remove(name);
  } catch {
    // Shared storage unavailable — a contact save must not care.
  }
}

// The newest backup on disk as { name, contacts }, or null. Used for the
// restore offer on a launch with an empty book.
export function readNewestBackup() {
  try {
    const b = bridge();
    if (!b) return null;
    const name = newestBackup(JSON.parse(b.list()));
    if (!name) return null;
    const contacts = parseBackup(b.read(name));
    return contacts?.length ? { name, contacts } : null;
  } catch {
    return null;
  }
}

// The explicit import: Android's own file picker, so a backup the app can no
// longer see (a reinstall drops MediaStore ownership) is still reachable.
// Resolves to the contact array, or null when cancelled or unreadable.
export function pickBackup() {
  return new Promise((resolve) => {
    const b = bridge();
    if (!b?.pick) return resolve(null);
    globalThis.__bgnBackupPicked = (text) => {
      delete globalThis.__bgnBackupPicked;
      resolve(text == null ? null : parseBackup(text));
    };
    try {
      b.pick();
    } catch {
      delete globalThis.__bgnBackupPicked;
      resolve(null);
    }
  });
}
