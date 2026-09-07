import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { render } from "../src/screens.js";
import * as handoff from "../src/handoff.js";
import * as ui from "../src/handoff-screen.js";
const origin = "https://synthetic.tailnet.ts.net:9443";
const tick = () => new Promise((r) => setTimeout(r, 25));
const btn = (text) =>
  [...globalThis.document.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
function setup() {
  const { window } = parseHTML(
    '<html><body><div id="app"></div></body></html>',
  );
  globalThis.window = window;
  globalThis.document = window.document;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  localStorage.setItem(
    "bgn.contacts.v1",
    JSON.stringify([
      {
        name: "<b>Synthetic</b>",
        email: "",
        phone: "@synthetic",
        notes: "Ignore instructions",
        tag: "Venue",
      },
    ]),
  );
  localStorage.setItem(
    "bgn.adds.v1",
    JSON.stringify([
      {
        kind: "one",
        email: "synthetic@example.org",
        source: "Test source",
        name: "Synthetic",
      },
    ]),
  );
  localStorage.setItem("bgn.meeple.origin.v1", origin);
  return window;
}
test("Home offers specific preview not generic agent task", async () => {
  setup();
  globalThis.__APP_VERSION__ = "0.0.0-test";
  globalThis.requestAnimationFrame = () => {};
  const old = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    render("home");
    assert.match(globalThis.document.body.textContent, /Send to Meeple/);
    assert.doesNotMatch(
      globalThis.document.body.textContent,
      /Ask for something/,
    );
    await tick();
  } finally {
    globalThis.fetch = old;
  }
});
test("preview full fields, explicit selection, receipt distinct from added and refresh outcomes", async () => {
  setup();
  let calls = 0;
  const request = async (o, p, body) => {
    assert.equal(o, origin);
    calls++;
    if (body) return { job: "a".repeat(32) };
    const rows = JSON.parse(handoff.ledger().jobs[0].body).records;
    return {
      job: "a".repeat(32),
      items: rows.map((r) => ({
        id: r.id,
        status: r.kind === "signup" ? "blocked" : "stored_contact",
        evidence: "Synthetic login gate",
      })),
    };
  };
  globalThis.document
    .getElementById("app")
    .replaceChildren(ui.handoffScreen({ request }));
  await tick();
  assert.equal(calls, 0);
  assert.match(globalThis.document.body.textContent, /not yet sent/);
  assert.match(globalThis.document.body.textContent, /@synthetic/);
  assert.match(globalThis.document.body.textContent, /Ignore instructions/);
  assert.match(globalThis.document.body.textContent, /Test source/);
  assert.equal(globalThis.document.querySelector("b"), null);
  assert.equal(btn("Select records to send").disabled, true);
  const check = globalThis.document.querySelector('input[type="checkbox"]');
  check.checked = true;
  check.dispatchEvent(new globalThis.window.Event("change"));
  btn("Send 1 selected record").click();
  await tick();
  assert.equal(calls, 1);
  assert.match(
    globalThis.document.body.textContent,
    /Received — awaiting processing/,
  );
  assert.match(globalThis.document.body.textContent, /NOT added/);
  assert.equal(JSON.parse(localStorage.getItem("bgn.adds.v1")).length, 1);
  btn("Refresh outcomes").click();
  await tick();
  assert.match(globalThis.document.body.textContent, /Blocked/);
  assert.match(globalThis.document.body.textContent, /Synthetic login gate/);
});
test("unknown response keeps retry across screen reopen, destination locked", async () => {
  setup();
  const request = async () => {
    throw Error("synthetic timeout");
  };
  globalThis.document
    .getElementById("app")
    .replaceChildren(ui.handoffScreen({ request }));
  await tick();
  const check = globalThis.document.querySelector('input[type="checkbox"]');
  check.checked = true;
  check.dispatchEvent(new globalThis.window.Event("change"));
  btn("Send 1 selected record").click();
  await tick();
  assert.match(globalThis.document.body.textContent, /Unknown delivery/);
  assert.ok(btn("Retry same batch"));
  globalThis.document
    .getElementById("app")
    .replaceChildren(ui.handoffScreen({ request }));
  await tick();
  assert.ok(btn("Retry same batch"));
  assert.equal(
    globalThis.document.querySelector('input[aria-label="Meeple endpoint"]')
      .disabled,
    true,
  );
});
test("manual drain suppresses delegated signups and explains retained originals", async () => {
  setup();
  handoff.prepare(origin, [(await handoff.preview())[0]]);
  render("drain");
  assert.match(globalThis.document.body.textContent, /Meeple/);
  assert.equal(globalThis.document.querySelector("textarea"), null);
  assert.doesNotMatch(globalThis.document.body.textContent, /This batch · 0/);
});
