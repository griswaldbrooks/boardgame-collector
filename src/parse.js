// Validation and parsing rules — exactly as specified in README.md
// ("Interactions & Behavior"). Live on every keystroke; the disabled CTA
// label is the only prompt.

export const isValidEmail = (s) => /.+@.+\..+/.test(s);

// Spec: split on /[\s,;]+/, keep tokens containing '@' past position 0
// (drops empty tokens and tokens with no local part, like "@site.com").
export const parseBatch = (text) =>
  text.split(/[\s,;]+/).filter((t) => t.indexOf("@") > 0);
