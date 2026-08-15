// Screen renders for the Flow 1 build: Home (spec §1), Add to mailing list
// (§2), Done (§8), plus stubs for screens this build doesn't wire up.

import { h, header, sectionLabel, cta, agentRow, chipRow } from "./ui.js";
import { state, resetAdd } from "./state.js";
import { isValidEmail, parseBatch } from "./parse.js";
import { enqueue, forward } from "./queue.js";
import { addActivity, listActivity, dayLabel } from "./activity.js";
import { go, back, homeFromDone } from "./router.js";

const SOURCES = ["At an event", "Discord", "Friend referral", "Website form"];

// Agent handoff pre-fill text per flow (spec "Shared: Agent handoff row").
// The agent screen is a stub in this build, but the pre-fill still arrives.
const HANDOFF_TASK = {
  add: "Add everyone who reacted 🎲 to the last #announcements post to the mailing list.",
  batch: "Take the emails I pasted, drop anyone already on the list, and invite the rest.",
};

function shell(kicker, title, cancel, ...body) {
  return h(
    "div",
    { class: "screen" },
    header(kicker, title, cancel ? back : null),
    h("main", { class: "content" }, body),
  );
}

export function render(screen, opts) {
  if (screen === "add") resetAdd(); // spec "Field clearing"
  const build = SCREENS[screen] ?? SCREENS.home;
  document.getElementById("app").replaceChildren(build(opts));
}

/* ------------------------------ 1. Home ------------------------------ */

const ACTIONS = [
  { icon: "📬", cls: "action-mail", title: "Add to mailing list", sub: "Scan, paste, or type — batches too", screen: "add" },
  { icon: "📣", cls: "action-message", title: "Message the list", sub: "Announce or remind, from a template", screen: "broadcast" },
  { icon: "🗓️", cls: "action-luma", title: "Add a community Luma event", sub: "Paste a link → our calendar", screen: "luma" },
  { icon: "📇", cls: "action-contact", title: "Save a contact", sub: "Venue, sponsor, or vendor — not the list", screen: "contact" },
];

function nextEventCard() {
  // PLACEHOLDER data (spec copy). The event source integration — real date,
  // venue, RSVP/capacity/member counts — is future work.
  return h(
    "div",
    { class: "card event-card" },
    h(
      "div",
      { class: "event-title-row" },
      h("div", { class: "event-title" }, "🎲 Next event"),
      h("span", { class: "pill" }, "6 days out"),
    ),
    h(
      "div",
      { class: "event-lines" },
      h("div", { class: "event-line" }, "Wednesday, Aug 5 · 6:00–9:00 pm"),
      h("div", { class: "event-line" }, "Cambridge Public Library, Lecture Hall"),
    ),
    h(
      "div",
      { class: "stat-row" },
      stat("34", "RSVPs"),
      stat("50", "Capacity"),
      stat("412", "On the list"),
    ),
  );
}

function stat(value, label) {
  return h(
    "div",
    { class: "stat" },
    h("div", { class: "stat-value" }, value),
    h("div", { class: "stat-label" }, label),
  );
}

function actionCard(a) {
  return h(
    "button",
    { class: `action-card ${a.cls}`, type: "button", onclick: () => go(a.screen) },
    h("span", { class: "tile" }, a.icon),
    h(
      "span",
      { class: "action-text" },
      h("span", { class: "action-title" }, a.title),
      h("span", { class: "action-sub" }, a.sub),
    ),
    h("span", { class: "action-chevron" }, "›"),
  );
}

function recentCard() {
  const rows = listActivity();
  if (!rows.length) {
    return h("div", { class: "card" }, h("div", { class: "empty" }, "Nothing yet — invites you send show up here."));
  }
  return h(
    "div",
    { class: "card rows-card" },
    rows.map((r) =>
      h(
        "div",
        { class: "recent-row" },
        h("div", { class: "recent-when" }, dayLabel(r.ts)),
        h("div", { class: "recent-what" }, r.what),
      ),
    ),
  );
}

function homeScreen() {
  return shell(
    "Wednesday crew",
    "Home",
    false,
    nextEventCard(),
    // The agent status strip renders only when the agent has work (spec);
    // the Discord agent isn't connected yet, so there is nothing to show.
    sectionLabel("👇 Do a thing"),
    ACTIONS.map(actionCard),
    sectionLabel("✨ Recent activity"),
    recentCard(),
  );
}

/* ------------------------- 2. Add to mailing list ------------------------- */

function fieldGroup(labelText, control, { optional = false, chips = false } = {}) {
  const label = optional
    ? h("div", { class: "field-label" }, `${labelText} `, h("span", { class: "opt" }, "optional"))
    : h("div", { class: "field-label" }, labelText);
  return h("div", { class: chips ? "field field-chips" : "field" }, label, control);
}

function submitOne() {
  const email = state.email.trim();
  const name = state.name.trim();
  enqueue({ kind: "one", email, name: name || undefined, source: state.source });
  addActivity(`Sent join link to ${name || email}`);
  go("done", { done: { kind: "one", who: name || email } });
  forward(); // hand the join-link message to the coordinator's apps
}

function submitBatch() {
  const emails = parseBatch(state.batch);
  if (!emails.length) return;
  enqueue({ kind: "batch", emails });
  addActivity(`Sent join link to ${emails.length} people`);
  go("done", { done: { kind: "batch", n: emails.length } });
  forward(); // one BCC'd message via the coordinator's mail app
}

function oneMode() {
  const submit = cta(
    () => (isValidEmail(state.email) ? "Send join link" : "Enter an email"),
    () => isValidEmail(state.email),
    submitOne,
  );
  const emailInput = h("input", {
    class: "input",
    inputmode: "email",
    autocomplete: "off",
    placeholder: "name@example.com",
    value: state.email,
    oninput: (e) => {
      state.email = e.target.value;
      submit.update();
    },
  });
  const nameInput = h("input", {
    class: "input",
    autocomplete: "off",
    placeholder: "Alex Rivera",
    value: state.name,
    oninput: (e) => {
      state.name = e.target.value;
    },
  });
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "card field-card" },
      fieldGroup("Email", emailInput),
      fieldGroup("Name", nameInput, { optional: true }),
      fieldGroup(
        "Met them at",
        chipRow(SOURCES, (o) => o === state.source, (o) => {
          state.source = o;
        }),
        { chips: true },
      ),
    ),
    h(
      "div",
      { class: "explain" },
      h("div", { class: "explain-glyph" }, "◔"),
      h(
        "div",
        { class: "explain-body" },
        "Sends them a one-tap link to join ",
        h("span", { class: "explain-addr" }, "bgn-wg"),
        ". They tap Join on their phone; you never open a laptop.",
      ),
    ),
    submit.btn,
    agentRow("Have the agent pull everyone who reacted 🎲 in Discord onto the list", () =>
      go("agent", { task: HANDOFF_TASK.add }),
    ),
  );
}

// Local roster stub for the dupe check (captain decision, 2026-08-15).
// ponytail: empty until the CSV-import roster sync lands ("Sync from Google
// Group" → Members → Export list); then load it in place of this constant.
const ROSTER = [];

function batchMode() {
  const emails = () => parseBatch(state.batch);
  const submit = cta(
    () => (emails().length ? `Send join link to ${emails().length} people` : "Paste some emails"),
    () => emails().length > 0,
    submitBatch,
  );
  const countLeft = h("div", { class: "batch-count" });
  const countRight = h("div", { class: "batch-dupes" });
  function refresh() {
    const list = emails();
    const dupes = list.filter((e) => ROSTER.includes(e)).length;
    countLeft.textContent = list.length ? `${list.length} valid addresses` : "Nothing pasted yet";
    countRight.textContent = dupes ? `${dupes} already on the list` : "";
    submit.update();
  }
  const area = h("textarea", {
    class: "input batch-area",
    placeholder: "jo@site.com, sam@site.com\nkim@site.com",
    value: state.batch,
    oninput: (e) => {
      state.batch = e.target.value;
      refresh();
    },
  });
  refresh();
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "card field-card" },
      h("div", { class: "field-label" }, "Paste emails — commas, spaces, or one per line"),
      area,
      h("div", { class: "batch-counts" }, countLeft, countRight),
    ),
    submit.btn,
    agentRow("Have the agent dedupe this batch and invite the new ones", () =>
      go("agent", { task: HANDOFF_TASK.batch }),
    ),
  );
}

function addScreen() {
  const body = h("div", { class: "stack" });
  const tabOne = h("button", { class: "tab", type: "button", onclick: () => setMode("one") }, "One person");
  const tabBatch = h("button", { class: "tab", type: "button", onclick: () => setMode("batch") }, "Paste a batch");
  function setMode(mode) {
    state.mode = mode;
    tabOne.classList.toggle("tab-on", mode === "one");
    tabBatch.classList.toggle("tab-on", mode === "batch");
    body.replaceChildren(mode === "one" ? oneMode() : batchMode());
  }
  setMode(state.mode);
  return shell("Mailing list", "Add members", true, h("div", { class: "tabs" }, tabOne, tabBatch), body);
}

/* --------------------------- 8. Done (shared) --------------------------- */

function doneScreen(opts) {
  const done = opts?.done ?? { kind: "one", who: "They" };
  const [title, body] =
    done.kind === "batch"
      ? [
          `Invited ${done.n} people`,
          "Your message with the join link is on the way. Anyone already on the list was skipped.",
        ]
      : ["Invite sent", `${done.who} will get your message with the join link.`];
  return shell(
    null,
    "Done",
    false,
    h(
      "div",
      { class: "done-col" },
      h("div", { class: "done-badge" }, "✓"),
      h(
        "div",
        { class: "done-copy" },
        h("div", { class: "done-title" }, title),
        h("div", { class: "done-body" }, body),
      ),
      h(
        "div",
        { class: "done-actions" },
        // One pop returns to the add entry; entering add clears the fields
        // (spec "Field clearing"), so this reads as a fresh form.
        h("button", { class: "cta", type: "button", onclick: back }, "Add another"),
        h("button", { class: "btn-secondary", type: "button", onclick: homeFromDone }, "Back to home"),
      ),
    ),
  );
}

/* ---------------- Stubs: screens this build doesn't wire up ---------------- */

function agentScreen(opts) {
  return shell(
    "#coordinators",
    "Agent 🤖",
    true,
    h(
      "div",
      { class: "agent-banner" },
      h("div", { class: "agent-banner-emoji" }, "🤖"),
      h(
        "div",
        { class: "agent-banner-copy" },
        h("div", { class: "agent-banner-title" }, "Discord agent not connected"),
        h(
          "div",
          { class: "agent-banner-sub" },
          "When the agent runs in #coordinators, handed-off tasks will post there. This screen is a stub until then.",
        ),
      ),
    ),
    opts?.task
      ? h(
          "div",
          { class: "card field-card" },
          h("div", { class: "field-label" }, "Ask for something 🗣️"),
          h("div", { class: "task-preview" }, opts.task),
        )
      : null,
  );
}

const FUTURE_FLOWS = {
  broadcast: ["412 members", "Message the list"],
  luma: ["Community calendar", "Add Luma event"],
  contact: ["Private · coordinators only", "Save a contact"],
};

function futureScreen(key) {
  const [kicker, title] = FUTURE_FLOWS[key];
  return shell(
    kicker,
    title,
    true,
    h(
      "div",
      { class: "card" },
      h("div", { class: "card-title" }, "Not wired up yet"),
      h(
        "p",
        { class: "card-body" },
        "This flow is follow-up work — this build ships Flow 1, the mailing-list add.",
      ),
    ),
  );
}

const SCREENS = {
  home: homeScreen,
  add: addScreen,
  done: doneScreen,
  agent: agentScreen,
  broadcast: () => futureScreen("broadcast"),
  luma: () => futureScreen("luma"),
  contact: () => futureScreen("contact"),
};
