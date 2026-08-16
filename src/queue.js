// Store-and-forward queue for join-link share intents (ADR 0002).
//
// Submit = enqueue + optimistic confirm (the UI moves on at once, per the
// spec's missing-states note). Forwarding hands the oldest pending intent to
// the coordinator's own apps via src/backend.js. A handoff needs a
// coordinator gesture (share sheet / mail app), so forward() runs on submit,
// never on boot. localStorage survives app restarts, so an add whose handoff
// was cancelled — or never reached — is still pending after kill/relaunch.

import { handOff } from "./backend.js";

const KEY = "bgn.adds.v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function save(queue) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueue(intent) {
  save([...load(), intent]);
}

let forwarding = false; // one handoff at a time

export async function forward() {
  if (forwarding) return;
  forwarding = true;
  try {
    const queue = load();
    if (!queue.length) return;
    try {
      await handOff(queue[0]);
      queue.shift();
      save(queue);
    } catch (err) {
      // Cancelled share or no share target: keep the intent for the next
      // forward (store-and-forward).
      console.warn(`[queue] handoff incomplete, kept pending: ${err?.message ?? err}`);
    }
  } finally {
    forwarding = false;
  }
}
