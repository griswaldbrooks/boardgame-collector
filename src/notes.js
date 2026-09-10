// General notes (docs/adr/0010-general-notes.md). A coordinator's scratchpad
// for everything the other flows don't own: the venue's setup quirk, the
// table that needed a second rules copy, the thing to remember for next
// Wednesday. Device-local only — same persistence approach as the contact
// book and the add queue (localStorage survives kill/relaunch) — and, like
// the book, every change and every launch gets a dated JSON copy in
// Downloads/BGN Coordinator/ so an uninstall or an app-data clear can't eat
// it (docs/adr/0009's lesson, applied from day one).

import { writeNotesBackup, mergeNotes } from "./backup.js";

const KEY = "bgn.notes.v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function store(notes) {
  localStorage.setItem(KEY, JSON.stringify(notes));
  // Fire-and-forget and off the interactive path (docs/adr/0009): neither a
  // storage failure nor a slow MediaStore hop ever costs the save.
  setTimeout(() => writeNotesBackup(notes), 0);
}

// No crypto in this repo (activity.js uses Date.now()); ts plus a short
// random tail keeps same-millisecond saves from colliding.
const newId = (ts) => `${ts}-${Math.random().toString(36).slice(2, 8)}`;

// Newest first, matching how the list renders.
export function saveNote(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const ts = Date.now();
  const note = { id: newId(ts), text, ts };
  store([note, ...load()]);
  return note;
}

// An edit bumps ts on purpose: a revised note is fresh information again and
// resurfaces to the top of the list instead of hiding where it was written.
export function editNote(id, raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const notes = load();
  const i = notes.findIndex((n) => n.id === id);
  if (i < 0) return null;
  notes[i] = { ...notes[i], text, ts: Date.now() };
  store(notes);
  return notes[i];
}

export function deleteNote(id) {
  const notes = load();
  const kept = notes.filter((n) => n.id !== id);
  if (kept.length === notes.length) return false;
  store(kept);
  return true;
}

export function listNotes() {
  return load().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

// Fold a backup file's notes in (picker import / restore offer). Returns how
// many were actually added — an import only ever adds (see mergeNotes).
export function importNotes(incoming) {
  const before = load();
  const merged = mergeNotes(before, incoming);
  store(merged);
  return merged.length - before.length;
}

// Launch backup point (docs/adr/0009, same as contacts/signups in main.js).
export function backupNotes() {
  writeNotesBackup(load());
}
