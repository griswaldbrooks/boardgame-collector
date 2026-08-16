// Screen renders: Home (spec §1), Add to mailing list (§2), Message the list
// (§4), Add a community Luma event (§5), Save a contact (§6), Done (§8),
// plus the agent screen stub (Discord agent not connected yet).

import { h, header, sectionLabel, cta, agentRow, chipRow } from "./ui.js";
import { state, resetAdd, resetBroadcast, resetContact, resetLuma } from "./state.js";
import { isValidEmail, parseBatch, splitDraft } from "./parse.js";
import { enqueue, forward } from "./queue.js";
import {
  LIST_MAIL,
  handOffBroadcast,
  calendarUrl,
  fetchEventPreview,
  fetchCalendarEvents,
  handOffLuma,
} from "./backend.js";
import { normalizeLumaUrl, formatWhen, findDuplicate } from "./luma.js";
import { saveContact, listContacts, rowOf } from "./contacts.js";
import { addActivity, listActivity, dayLabel } from "./activity.js";
import { go, back, homeFromDone } from "./router.js";

const SOURCES = ["At an event", "Discord", "Friend referral", "Website form"];

// Agent handoff pre-fill text per flow (spec "Shared: Agent handoff row").
// The agent screen is a stub in this build, but the pre-fill still arrives.
const HANDOFF_TASK = {
  add: "Add everyone who reacted 🎲 to the last #announcements post to the mailing list.",
  batch: "Take the emails I pasted, drop anyone already on the list, and invite the rest.",
  message: "Finish this reminder draft and send it to the list Monday at 9am.",
  luma: "Watch Luma for Boston tabletop events this week and add anything relevant to our calendar.",
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
  if (screen === "broadcast") resetBroadcast(); // state table: tpl → reminder
  if (screen === "contact") resetContact();
  if (screen === "luma") resetLuma();
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
  if (control.matches?.("input, textarea, select")) control.setAttribute("aria-label", labelText);
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

const BATCH_LABEL = "Paste emails — commas, spaces, or one per line";

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
    "aria-label": BATCH_LABEL,
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
      h("div", { class: "field-label" }, BATCH_LABEL),
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

/* --------------------------- 4. Message the list --------------------------- */

const TEMPLATES = [
  { id: "reminder", title: "Event reminder", desc: "Two days out — time, place, what to bring" },
  { id: "announce", title: "New event announced", desc: "Date, venue, RSVP link" },
  { id: "recap", title: "Post-night recap", desc: "Games played, photos, next date" },
];

// Preview copy per spec §4, swapped with the selection. Editable before
// sending (spec production note): the preview card IS a textarea styled as
// the preview text, so editing needs no mode switch.
const PREVIEWS = {
  reminder:
    "Subject: Wednesday at the Cambridge Library\n\nHi all — we're on for Wed Aug 5, 6–9pm, Lecture Hall. 34 RSVPs so far. Bring a game if you've got a favorite.",
  announce:
    "Subject: Next board game night — Aug 5\n\nWe've got the Lecture Hall at Cambridge Public Library, 6–9pm. Free, all levels. RSVP so we know how many tables to set.",
  recap:
    "Subject: Last night was a good one\n\nThanks to the 38 of you who came out. Heavy Wingspan energy. Photos below — next up Aug 5.",
};

// There is no live member count: consumer googlegroups.com groups have no
// membership API (docs/adr/0002-self-serve-join-link.md). The batch dupe
// check's local roster is the only count available — an empty stub until the
// CSV roster sync lands (see ROSTER below), so until then the CTA and kicker
// use count-less copy instead of hardcoding a fake-live number.
const memberCount = () => ROSTER.length || null;

function broadcastScreen() {
  const count = memberCount();
  const reach = count ? `${count} members` : "the list";

  const area = h("textarea", {
    class: "preview-area",
    "aria-label": "Preview",
    value: PREVIEWS[state.tpl],
    oninput: () => {
      grow();
      submit.update();
    },
  });
  function grow() {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }

  const submit = cta(
    () =>
      !area.value.trim()
        ? "Write something first"
        : count
          ? `Send to ${count} members`
          : "Send to the list",
    () => area.value.trim().length > 0,
    () => setConfirming(true),
  );

  // Lightweight confirm before a whole-list send (spec production note).
  const sendBtn = h(
    "button",
    { class: "cta", type: "button", onclick: sendBroadcast },
    "Open in my mail app",
  );
  const confirmBlock = h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "card" },
      h("div", { class: "card-title" }, "Send this message?"),
      h(
        "div",
        { class: "card-body" },
        `It opens in your mail app, addressed to ${LIST_MAIL}. Nothing sends until you send it there.`,
      ),
      h("div", { class: "confirm-notice" }),
    ),
    sendBtn,
    h(
      "button",
      { class: "btn-secondary", type: "button", onclick: () => setConfirming(false) },
      "Keep editing",
    ),
  );

  async function sendBroadcast() {
    if (sendBtn.disabled) return;
    // The preview stays editable behind the confirm block, so re-check the
    // same emptiness guard the CTA enforces.
    if (!area.value.trim()) {
      setConfirming(false);
      return;
    }
    sendBtn.disabled = true;
    try {
      await handOffBroadcast(splitDraft(area.value));
    } catch (err) {
      console.warn(`[broadcast] mail handoff failed: ${err?.message ?? err}`);
      confirmBlock.querySelector(".confirm-notice").textContent =
        "Couldn't open your mail app. Try again.";
      sendBtn.disabled = false;
      return;
    }
    addActivity(`Message sent to ${reach}`);
    go("done", { done: { kind: "message", reach } });
  }

  // CTA normally; the confirm block replaces it once tapped.
  const tail = h("div", { class: "stack" }, submit.btn);
  function setConfirming(on) {
    tail.replaceChildren(on ? confirmBlock : submit.btn);
  }

  const tplButtons = TEMPLATES.map((t) =>
    h(
      "button",
      {
        class: "tpl-card",
        type: "button",
        onclick: () => {
          state.tpl = t.id;
          area.value = PREVIEWS[t.id]; // spec: preview content swaps with selection
          grow();
          refresh();
        },
      },
      h("div", { class: "tpl-title" }, t.title),
      h("div", { class: "tpl-desc" }, t.desc),
    ),
  );
  function refresh() {
    tplButtons.forEach((b, i) => b.classList.toggle("tpl-on", TEMPLATES[i].id === state.tpl));
    submit.update();
  }
  refresh();
  // The screen tree is built detached, so scrollHeight is only meaningful once
  // it is in the document — size the initial template copy on the next frame.
  requestAnimationFrame(grow);

  return shell(
    count ? `${count} members` : "Mailing list",
    "Message the list",
    true,
    sectionLabel("Start from"),
    tplButtons,
    h(
      "div",
      { class: "card preview-card" },
      h("div", { class: "field-label" }, "Preview"),
      area,
    ),
    tail,
    agentRow("Have the agent finish this draft and send it Monday 9am", () =>
      go("agent", { task: HANDOFF_TASK.message }),
    ),
  );
}

/* ---------------------- 5. Add a community Luma event ---------------------- */
// Credential-free v1 (docs/adr/0004-credential-free-luma-handoff.md):
// read-only GETs of public pages for preview + best-effort dedupe; the add
// itself is a handoff into Luma's own Add Event panel — the app never writes.

function lumaPreviewCard(p) {
  const meta = [formatWhen(p.startAt, p.timezone), p.venue].filter(Boolean).join(" · ");
  return h(
    "div",
    { class: "card" },
    sectionLabel("Pulled from Luma"),
    h("div", { class: "luma-title" }, p.title),
    meta ? h("div", { class: "luma-meta" }, meta) : null,
    p.tags.length
      ? h(
          "div",
          { class: "luma-tags" },
          p.tags.map((t, i) =>
            h("span", { class: i === 0 ? "tag-pill tag-pill-accent" : "tag-pill" }, t),
          ),
        )
      : null,
  );
}

function lumaScreen() {
  let seq = 0; // stale-fetch guard: the last scheduleCheck wins
  let timer = null;
  let phase = "idle"; // idle | loading | error | ready
  let dedupe = "idle"; // idle | checking | miss | hit | unreadable
  let offline = false;
  let preview = null;
  let fetched = null; // { url, preview, dedupe } — one-URL cache, no refetch

  const dyn = h("div", { class: "stack" });
  const notice = h("div", { class: "confirm-notice" });

  const submit = cta(
    () => {
      if (phase === "loading") return "Pulling preview…";
      if (phase === "error") return "No preview to add";
      if (phase === "ready") {
        if (dedupe === "checking") return "Checking our calendar…";
        if (dedupe === "hit") return "Already on our calendar";
        return "Add to our calendar";
      }
      return "Paste a Luma link";
    },
    () => phase === "ready" && (dedupe === "miss" || dedupe === "unreadable"),
    submitLuma,
  );

  function repaint() {
    const kids = [];
    if (phase === "loading") {
      kids.push(h("div", { class: "card luma-note" }, h("span", { class: "spinner" }), "Pulling preview…"));
    } else if (phase === "error") {
      kids.push(
        h(
          "div",
          { class: "card luma-note luma-error" },
          offline
            ? "You're offline — pulling a preview needs a connection."
            : "Couldn't pull a preview — check the link. Private events can't be added to a community calendar.",
        ),
      );
    } else if (phase === "ready" && preview) {
      kids.push(lumaPreviewCard(preview));
      if (dedupe === "hit") {
        kids.push(
          h(
            "div",
            { class: "luma-already" },
            h("div", { class: "luma-already-badge" }, "✓"),
            h(
              "div",
              { class: "luma-already-copy" },
              h("div", { class: "luma-already-title" }, "Already on our calendar"),
              h("div", { class: "luma-already-sub" }, `${preview.title} is listed with the upcoming events.`),
            ),
          ),
        );
      } else if (dedupe === "unreadable") {
        kids.push(
          h("div", { class: "luma-check-note" }, "Couldn't check our calendar — you can still add it there."),
        );
      }
    }
    dyn.replaceChildren(...kids);
    submit.update();
  }

  async function run(url) {
    const my = seq;
    dedupe = calendarUrl() ? "checking" : "unreadable";
    repaint();
    const [pRes, cRes] = await Promise.allSettled([
      fetchEventPreview(url),
      dedupe === "checking" ? fetchCalendarEvents() : Promise.reject(new Error("unconfigured")),
    ]);
    if (my !== seq) return; // a newer input superseded this fetch
    if (pRes.status === "rejected" || (!pRes.value.title && !pRes.value.startAt)) {
      // network failure, or the page is not a public event
      offline = pRes.status === "rejected" && !navigator.onLine;
      phase = "error";
      repaint();
      return;
    }
    preview = pRes.value;
    if (!preview.url) preview.url = url;
    if (cRes.status === "fulfilled") {
      dedupe = findDuplicate(preview, cRes.value) ? "hit" : "miss";
    } else {
      dedupe = "unreadable"; // best-effort: say so and never block the add
    }
    phase = "ready";
    fetched = { url, preview, dedupe };
    repaint();
  }

  function scheduleCheck() {
    seq++;
    clearTimeout(timer);
    offline = false;
    notice.textContent = "";
    const url = normalizeLumaUrl(state.luma);
    if (!url) {
      phase = "idle";
      preview = null;
      dedupe = "idle";
      repaint();
      return;
    }
    if (fetched?.url === url) {
      // Same link as before (edit-and-retype): reuse the settled result.
      preview = fetched.preview;
      dedupe = fetched.dedupe;
      phase = "ready";
      repaint();
      return;
    }
    phase = "loading";
    preview = null;
    dedupe = "idle";
    repaint();
    timer = setTimeout(() => run(url), 500); // one fetch per pasted link
  }

  async function submitLuma() {
    if (!preview) return;
    submit.btn.disabled = true;
    submit.btn.textContent = "Opening Luma…";
    try {
      await handOffLuma(preview);
    } catch (err) {
      console.warn(`[luma] handoff failed: ${err?.message ?? err}`);
      notice.textContent = "Couldn't open Luma. Try again.";
      submit.update();
      return;
    }
    addActivity(`Added "${preview.title}" to the calendar`);
    go("done", { done: { kind: "luma", title: preview.title } });
  }

  return shell(
    "Community calendar",
    "Add Luma event",
    true,
    h(
      "div",
      { class: "card field-card" },
      fieldGroup(
        "Luma link",
        h("input", {
          class: "input input-mono",
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: "false",
          placeholder: "lu.ma/…",
          value: state.luma,
          oninput: (e) => {
            state.luma = e.target.value;
            scheduleCheck();
          },
        }),
      ),
    ),
    dyn,
    submit.btn,
    notice,
    agentRow("Have the agent watch Luma and add community events all week", () =>
      go("agent", { task: HANDOFF_TASK.luma }),
    ),
  );
}

/* ---------------------------- 6. Save a contact ---------------------------- */

const CTAGS = ["🏛️ Venue", "💰 Sponsor", "🎁 Vendor", "🙋 Volunteer"];

function submitContact() {
  const name = state.cName.trim();
  if (!name) return;
  saveContact({
    name,
    email: state.cEmail.trim(),
    phone: state.cPhone.trim(),
    notes: state.cNotes.trim(),
    tag: state.cTag,
  });
  go("done", { done: { kind: "contact", who: name } });
}

function savedCard() {
  const rows = listContacts();
  if (!rows.length) {
    return h(
      "div",
      { class: "card" },
      h("div", { class: "empty" }, "Nothing yet — contacts you save show up here."),
    );
  }
  return h(
    "div",
    { class: "card rows-card" },
    rows.map((c) => {
      const r = rowOf(c);
      return h(
        "div",
        { class: "contact-row" },
        h("div", { class: "contact-row-emoji" }, r.icon),
        h(
          "div",
          { class: "contact-row-text" },
          h("div", { class: "contact-name" }, r.name),
          r.note ? h("div", { class: "contact-note" }, r.note) : null,
        ),
      );
    }),
  );
}

function contactScreen() {
  const submit = cta(
    () => (state.cName.trim() ? "Save contact 📇" : "Add a name first"),
    () => state.cName.trim().length > 0,
    submitContact,
  );
  return shell(
    "Private · coordinators only",
    "Save a contact",
    true,
    h(
      "div",
      { class: "privacy-banner" },
      h("div", { class: "privacy-banner-emoji" }, "🔒"),
      h(
        "div",
        { class: "privacy-banner-body" },
        "Private to coordinators. Nothing here touches the mailing list or gets emailed.",
      ),
    ),
    h(
      "div",
      { class: "card field-card" },
      fieldGroup(
        "Name",
        h("input", {
          class: "input",
          autocomplete: "off",
          placeholder: "Dana Whitfield",
          value: state.cName,
          oninput: (e) => {
            state.cName = e.target.value;
            submit.update();
          },
        }),
      ),
      fieldGroup(
        "Email",
        h("input", {
          class: "input input-mono",
          inputmode: "email",
          autocomplete: "off",
          placeholder: "events@cambridgelibrary.org",
          value: state.cEmail,
          oninput: (e) => {
            state.cEmail = e.target.value;
          },
        }),
      ),
      fieldGroup(
        "Phone or handle",
        h("input", {
          class: "input",
          autocomplete: "off",
          placeholder: "617-555-0148 · @dana on Discord",
          value: state.cPhone,
          oninput: (e) => {
            state.cPhone = e.target.value;
          },
        }),
        { optional: true },
      ),
      fieldGroup(
        "Who is this?",
        chipRow(CTAGS, (o) => o === state.cTag, (o) => {
          state.cTag = o;
        }),
        { chips: true },
      ),
      fieldGroup(
        "Notes 📝",
        h("textarea", {
          class: "input notes-area",
          placeholder: "Books the lecture hall. Needs 3 weeks notice, no food past 8pm.",
          value: state.cNotes,
          oninput: (e) => {
            state.cNotes = e.target.value;
          },
        }),
      ),
    ),
    submit.btn,
    agentRow("Have the agent email them about hosting a night in September", () =>
      go("agent", {
        task: `Email ${state.cName.trim() || "this contact"} about hosting a night in September.`,
      }),
    ),
    sectionLabel("Saved contacts"),
    savedCard(),
  );
}

/* --------------------------- 8. Done (shared) --------------------------- */

const DONE_COPY = {
  one: (d) => ["Invite sent", `${d.who} will get your message with the join link.`],
  batch: (d) => [
    `Invited ${d.n} people`,
    "Your message with the join link is on the way. Anyone already on the list was skipped.",
  ],
  contact: (d) => ["Contact saved 📇", `${d.who} is in the coordinator address book. No emails sent.`],
  // Message copy follows the ADR 0002 honesty pattern: the app hands the
  // composed mail to the coordinator's mail app, so the body says where the
  // message is rather than claiming a delivery the app can't see.
  message: (d) => [
    "Message sent",
    `Your mail app has the message — send it there to reach ${d.reach}. It'll also show up in the group archive.`,
  ],
  // The app hands the add to Luma's own UI (ADR 0004), so the copy says
  // where things stand rather than claiming the calendar already shows it.
  luma: (d) => [
    "Finish adding in Luma",
    `Luma opens at our calendar's add-event panel. Paste the link there — ${d.title} shows on our calendar once it's confirmed.`,
  ],
};

function doneScreen(opts) {
  const done = opts?.done ?? { kind: "one", who: "They" };
  const [title, body] = (DONE_COPY[done.kind] ?? DONE_COPY.one)(done);
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
        // One pop returns to the task screen; entering it clears the fields
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

const SCREENS = {
  home: homeScreen,
  add: addScreen,
  broadcast: broadcastScreen,
  done: doneScreen,
  agent: agentScreen,
  luma: lumaScreen,
  contact: contactScreen,
};
