// Local UI state — the keys from the spec's "State Management" table that
// this flow uses.

export const state = {
  mode: "one", // one | batch
  email: "",
  name: "",
  source: "At an event",
  batch: "",
  tpl: "reminder", // reminder | announce | recap
};

// Entering the add screen resets per spec "Field clearing": email, name,
// batch, and mode. (The source chip deliberately survives — the spec
// enumerates exactly which keys reset, matching the prototype.)
export function resetAdd() {
  state.mode = "one";
  state.email = "";
  state.name = "";
  state.batch = "";
}

// Entering the broadcast screen resets the template selection to its default
// (state table: tpl defaults to reminder), which rebuilds the preview from the
// template copy and so drops any edited draft.
export function resetBroadcast() {
  state.tpl = "reminder";
}
