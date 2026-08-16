// The ONE swap point between the app and the add-member mechanism.
//
// v1 (docs/adr/0002-self-serve-join-link.md): consumer googlegroups.com
// groups have no membership API, so the app composes a message with the
// join link and hands it to the coordinator's own apps — the device share
// sheet for a single add, one BCC'd email for a batch. The app never sends
// anything itself: composing works offline and needs no network here.

export const JOIN_LINK = "https://groups.google.com/g/bgn-wg/about";
export const JOIN_MAIL = "bgn-wg+subscribe@googlegroups.com";
// Mailing a Google Group's own address IS broadcasting to it, so Flow 2's
// send mechanism is the same self-serve pattern as the add flow (ADR 0002):
// compose a mailto and let the coordinator's own mail app do the sending.
export const LIST_MAIL = "bgn-wg@googlegroups.com";

export function composeMessage() {
  return (
    `One-tap link to join bgn-wg: ${JOIN_LINK}\n` +
    `Or join by email: mailto:${JOIN_MAIL}`
  );
}

const SUBJECT = "Join Board Game Night";

export function singleMailtoUri(email) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(composeMessage())}`;
}

// One message to the whole batch, recipients in BCC, sent by the
// coordinator's own mail app (captain decision, 2026-08-15).
export function batchMailtoUri(emails) {
  return `mailto:?bcc=${emails.map(encodeURIComponent).join(",")}&subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(composeMessage())}`;
}

// Flow 2 broadcast: the edited preview's subject + body, addressed to the
// group. Sent by the coordinator's own mail app — the app never sends itself.
export function broadcastMailtoUri(subject, body) {
  return `mailto:${LIST_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// The opener JS API is only IPC wrappers; importing it statically is safe
// outside Tauri (it is never called there).
import { openUrl } from "@tauri-apps/plugin-opener";

// OS-level handoff (ACTION_VIEW on Android via tauri-plugin-opener). A bare
// location.href can't carry a mailto: through the WebView — it dies with
// ERR_UNKNOWN_URL_SCHEME and wipes the app UI.
async function openExternal(uri) {
  if (window.__TAURI_INTERNALS__) {
    await openUrl(uri);
    return;
  }
  // Bare browser (desktop dev): plain navigation opens the mail client.
  window.location.href = uri;
}

// Hand the confirmed broadcast to the coordinator's mail app. Resolves once
// the OS accepts the handoff; throws when it can't (no mail app), and the
// caller stays on the confirm step — the draft is untouched, so tapping again
// retries. No store-and-forward here on purpose: the add queue must not have
// a broadcast parked at its head blocking join-link handoffs.
export async function handOffBroadcast({ subject, body }) {
  await openExternal(broadcastMailtoUri(subject, body));
}

// Hand one pending intent to the coordinator's apps. Resolves once the OS
// accepts the handoff; throws when it can't (no share target / no mail app),
// and the queue keeps the intent pending — store-and-forward.
export async function handOff(intent) {
  if (intent.kind === "batch") {
    await openExternal(batchMailtoUri(intent.emails));
    return;
  }
  if (navigator.share) {
    await navigator.share({ title: SUBJECT, text: composeMessage() });
    return;
  }
  // No Web Share API (Android WebView): a mailto addressed to the member.
  await openExternal(singleMailtoUri(intent.email));
}
