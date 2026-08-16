// Flow 3 (Add a community Luma event): extraction chain, per-field
// degradation, URL normalization, and the best-effort dedupe match.
// All fixtures below are fabricated — obviously fake events and calendars,
// never the group's real calendar (docs/adr/0004).

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLumaUrl,
  slugOf,
  parseEventPage,
  formatWhen,
  parseCalendarEvents,
  findDuplicate,
} from "../src/luma.js";

/* ------------------------------ URL normalization ------------------------------ */

test("normalizeLumaUrl: lu.ma and luma.com spellings, query/fragment stripped", () => {
  assert.equal(normalizeLumaUrl("lu.ma/fake1234"), "https://luma.com/fake1234");
  assert.equal(normalizeLumaUrl("https://lu.ma/fake1234"), "https://luma.com/fake1234");
  assert.equal(normalizeLumaUrl("https://www.luma.com/fake1234"), "https://luma.com/fake1234");
  assert.equal(normalizeLumaUrl("luma.com/fake1234"), "https://luma.com/fake1234");
  assert.equal(
    normalizeLumaUrl("  https://lu.ma/fake1234?utm_source=chat#live  "),
    "https://luma.com/fake1234",
  );
  // Trailing path segments beyond the slug drop off.
  assert.equal(normalizeLumaUrl("lu.ma/fake1234/extra"), "https://luma.com/fake1234");
});

test("normalizeLumaUrl: non-Luma input yields null", () => {
  assert.equal(normalizeLumaUrl(""), null);
  assert.equal(normalizeLumaUrl("   "), null);
  assert.equal(normalizeLumaUrl("example.com/fake1234"), null);
  assert.equal(normalizeLumaUrl("not a link at all"), null);
  assert.equal(normalizeLumaUrl("lu.ma/"), null);
  assert.equal(normalizeLumaUrl("lu.ma/?utm_source=x"), null);
});

test("slugOf round-trips the slug", () => {
  assert.equal(slugOf("https://lu.ma/fake1234?x=1"), "fake1234");
  assert.equal(slugOf(null), null);
  assert.equal(slugOf("https://example.com/x"), null);
});

/* ------------------------------ extraction chain ------------------------------ */

// Fixture: full page — JSON-LD + OG + embedded page state, fake event.
const FULL_PAGE = `<!doctype html>
<html><head>
<script data-cfasync="false" type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","@id":"https://luma.com/fake1234",
 "url":"https://luma.com/fake1234","name":"Fixture Game Night",
 "location":{"@type":"Place","name":"Fixture Hall","address":{"@type":"PostalAddress","addressLocality":"Springfield"}},
 "image":["https://images.example.test/cover.png"],
 "description":"A fake event for tests.",
 "startDate":"2026-09-03T18:30:00.000-04:00","endDate":"2026-09-03T21:00:00.000-04:00"}
</script>
<meta property="og:title" content="Fixture Game Night · Luma">
<meta property="og:image" content="https://images.example.test/og.png">
<meta property="og:url" content="https://luma.com/fake1234">
</head><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"initialData":{"data":{
  "event":{"api_id":"evt-FakeFakeFakeFak","name":"Fixture Game Night","url":"fake1234",
           "start_at":"2026-09-03T22:30:00.000Z","timezone":"America/New_York",
           "geo_address_info":{"mode":"obfuscated","city":"Springfield","city_state":"Springfield, MA"},
           "cover_url":"https://images.example.test/cover.png"},
  "categories":[{"api_id":"cat-1","name":"Games"},{"api_id":"cat-2","name":"Community"}]
}}}}}
</script>
</body></html>`;

test("full page: every field extracted, dedupe id and canonical URL included", () => {
  const p = parseEventPage(FULL_PAGE);
  assert.equal(p.isEvent, true);
  assert.equal(p.title, "Fixture Game Night");
  assert.equal(p.startAt, "2026-09-03T18:30:00.000-04:00"); // JSON-LD wins
  assert.equal(p.timezone, "America/New_York");
  assert.equal(p.venue, "Fixture Hall"); // JSON-LD place name over obfuscated city
  assert.deepEqual(p.tags, ["Games", "Community"]);
  assert.equal(p.cover, "https://images.example.test/cover.png");
  assert.equal(p.eventId, "evt-FakeFakeFakeFak");
  assert.equal(p.url, "https://luma.com/fake1234");
});

// Fixture: only OpenGraph survives (JSON-LD and page state both gone).
const OG_ONLY_PAGE = `<html><head>
<meta property="og:title" content="OG Only Event · Luma">
<meta property="og:image" content="https://images.example.test/og.png">
<meta property="og:url" content="https://luma.com/ogonly77">
</head><body></body></html>`;

test("OG-only page degrades to a title, image, and URL — but is not an event page", () => {
  const p = parseEventPage(OG_ONLY_PAGE);
  // OG alone can't tell an event from a calendar page: the screen refuses it.
  assert.equal(p.isEvent, false);
  assert.equal(p.title, "OG Only Event"); // " · Luma" suffix stripped
  assert.equal(p.cover, "https://images.example.test/og.png");
  assert.equal(p.url, "https://luma.com/ogonly77");
  assert.equal(p.startAt, null);
  assert.equal(p.timezone, null);
  assert.equal(p.venue, null);
  assert.deepEqual(p.tags, []);
  assert.equal(p.eventId, null);
});

// Fixture: JSON-LD only (no OG, no page state) — venue host-obfuscated to city.
const LD_ONLY_PAGE = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"City Level Event",
 "location":{"@type":"Place","name":"Boston, MA"},
 "startDate":"2026-10-01T19:00:00.000-04:00"}
</script>`;

test("JSON-LD-only page still yields title, wall time, and city-level venue", () => {
  const p = parseEventPage(LD_ONLY_PAGE);
  assert.equal(p.isEvent, true);
  assert.equal(p.title, "City Level Event");
  assert.equal(p.venue, "Boston, MA");
  assert.equal(formatWhen(p.startAt, p.timezone), "Thu Oct 1 · 7:00 pm");
  assert.equal(p.eventId, null); // id only lives in the page state
});

test("page state venue wins when the host published a real address", () => {
  const page = `<script id="__NEXT_DATA__" type="application/json">
  {"props":{"pageProps":{"initialData":{"data":{"event":{
    "api_id":"evt-AddrVenueFake12","name":"Venue Event","url":"venfake88",
    "start_at":"2026-09-05T23:00:00.000Z","timezone":"America/New_York",
    "geo_address_info":{"mode":"visible","address":"The Back Room","city_state":"Boston, MA"}}}}}}}
  </script>`;
  const p = parseEventPage(page);
  assert.equal(p.venue, "The Back Room");
});

// A real calendar page serves an og:title, so the title alone can't tell it
// apart from an event — only the absence of an event object can.
test("a non-event page reads as not-an-event even when it serves an og:title", () => {
  const p = parseEventPage(`<html><head>
    <meta property="og:title" content="Fixture Community Calendar · Luma">
    <meta property="og:url" content="https://luma.com/fixturecal">
    </head><body><script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"initialData":{"data":{"featured_items":[]}}}}}</script></body></html>`);
  assert.equal(p.isEvent, false);
  assert.equal(p.title, "Fixture Community Calendar");
  assert.equal(p.startAt, null);
  assert.equal(parseEventPage("").isEvent, false);
  assert.equal(parseEventPage("").title, null);
  assert.equal(parseEventPage("garbage, not html at all").title, null);
});

test("an empty og:title yields a null title, never an empty string", () => {
  const p = parseEventPage(`<html><head><meta property="og:title" content="">
    </head><body><script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"initialData":{"data":{"event":{
      "api_id":"evt-NamelessFake12","url":"nameless9","name":"  "}}}}}}</script></body></html>`);
  assert.equal(p.isEvent, true);
  assert.equal(p.title, null);
});

test("a malformed JSON-LD block does not sink a valid sibling", () => {
  const page = `<script type="application/ld+json">{broken json</script>
    <script type="application/ld+json">{"@type":"Event","name":"Second Block Wins"}</script>`;
  assert.equal(parseEventPage(page).title, "Second Block Wins");
});

/* ------------------------------ time rendering ------------------------------ */

test("formatWhen renders offset ISO in the event's own wall time", () => {
  assert.equal(formatWhen("2026-08-13T19:00:00.000-04:00"), "Thu Aug 13 · 7:00 pm");
  assert.equal(formatWhen("2026-08-13T09:05:00.000-04:00"), "Thu Aug 13 · 9:05 am");
  assert.equal(formatWhen("2026-08-13T00:30:00.000-04:00"), "Thu Aug 13 · 12:30 am");
});

test("formatWhen converts UTC + IANA zone to the event's wall time", () => {
  // 22:30 UTC on Sep 3 is 18:30 in New York (EDT, UTC-4).
  assert.equal(formatWhen("2026-09-03T22:30:00.000Z", "America/New_York"), "Thu Sep 3 · 6:30 pm");
});

test("formatWhen degrades on junk input", () => {
  assert.equal(formatWhen(null), null);
  assert.equal(formatWhen(""), null);
  assert.equal(formatWhen("not a date"), null);
});

/* ------------------------------ dedupe ------------------------------ */

const CALENDAR_PAGE = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"initialData":{"data":{
  "featured_items":[
    {"name":"Fixture Game Night","start_at":"2026-09-03T22:30:00.000Z","platform":"luma","status":"approved","tags":[],
     "event":{"api_id":"evt-FakeFakeFakeFak","url":"fake1234"}},
    {"name":"Trivia Tuesday","start_at":"2026-09-08T23:00:00.000Z","platform":"external","status":"approved","tags":[],
     "event":{"api_id":"evt-TriviaTriviaTri","url":"https://example.com/trivia"}}
  ]
}}}}}
</script></body></html>`;

test("parseCalendarEvents pulls ids + slugs from the embedded upcoming list", () => {
  const events = parseCalendarEvents(CALENDAR_PAGE);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { eventId: "evt-FakeFakeFakeFak", slug: "fake1234", name: "Fixture Game Night" });
  assert.equal(events[1].eventId, "evt-TriviaTriviaTri");
});

test("parseCalendarEvents is best-effort: unreadable pages yield []", () => {
  assert.deepEqual(parseCalendarEvents(""), []);
  assert.deepEqual(parseCalendarEvents("<html>no next data here</html>"), []);
  // A reshaped page that still carries the list somewhere under data.
  const reshaped = `<script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"initialData":{"data":{"upcoming":[
      {"name":"Moved List","event":{"api_id":"evt-MovedListFake12","url":"moved999"}}
    ]}}}}}</script>`;
  assert.equal(parseCalendarEvents(reshaped)[0].eventId, "evt-MovedListFake12");
});

test("findDuplicate matches by evt id first, then by slug, else null", () => {
  const events = parseCalendarEvents(CALENDAR_PAGE);
  const byId = findDuplicate(parseEventPage(FULL_PAGE), events);
  assert.equal(byId.name, "Fixture Game Night");
  // Same slug but no id extracted (OG-only preview) still matches.
  const bySlug = findDuplicate({ url: "https://luma.com/fake1234", eventId: null }, events);
  assert.equal(bySlug.eventId, "evt-FakeFakeFakeFak");
  assert.equal(findDuplicate({ url: "https://luma.com/unlisted1", eventId: "evt-Nope" }, events), null);
  assert.equal(findDuplicate({ url: null, eventId: null }, events), null);
});
