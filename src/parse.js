// Validation and parsing rules — exactly as specified in README.md
// ("Interactions & Behavior"). Live on every keystroke; the disabled CTA
// label is the only prompt.

export const isValidEmail = (s) => /.+@.+\..+/.test(s);

// Spec: split on /[\s,;]+/, keep tokens containing '@' past position 0
// (drops empty tokens and tokens with no local part, like "@site.com").
// Deduped, first occurrence wins, so the valid count, the CTA label and the
// BCC list never repeat an address.
export const parseBatch = (text) => [
  ...new Set(text.split(/[\s,;]+/).filter((t) => t.indexOf("@") > 0)),
];

// The broadcast preview edits as one text ("Subject: ...\n\nbody"); the
// mailto handoff needs them split. A draft edited past that shape (subject
// line deleted) sends with whatever is there — empty subject is fine.
export function splitDraft(draft) {
  const m = draft.match(/^Subject:[ \t]*(.*)\r?\n+([\s\S]*)$/);
  return m
    ? { subject: m[1].trim(), body: m[2] }
    : { subject: "", body: draft };
}
