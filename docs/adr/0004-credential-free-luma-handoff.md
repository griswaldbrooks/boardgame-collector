# 4. v1 adds community Luma events credential-free, handing the add to Luma's own UI

Date: 2026-08-15

## Status

Accepted (captain decision, 2026-08-15).

## Context

Flow 3 (`README.md` section 5) adds a community event to the group's
calendar from a pasted link: preview the event, check for duplicates, add it.
The handoff spec's "Real data needed" assumed a Luma integration for all
three. The integration scout (`boardgame-luma-scout`, 2026-08-15) found the
landscape had changed:

- Luma now has an official API (`public-api.luma.com`) with exactly the two
  endpoints flow 3 needs — `POST /v1/calendars/events/add` (add an existing
  event by URL) and `GET /v1/calendars/events/lookup` (duplicate check).
  Both require a per-calendar API key, which requires a **Luma Plus
  subscription ($59/month billed annually)** on that calendar. There is no
  free-tier key of any kind.
- The credential-free path is strong where it matters: public lu.ma event
  pages serve schema.org JSON-LD, OpenGraph tags, and embedded `__NEXT_DATA__`
  page state — title, start/timezone, venue, categories, cover, and the
  stable `evt-…` event id. Even a paying API customer must use this path to
  preview *someone else's* event (the API's Get Event only covers events you
  manage).
- The group's community calendar **is a Luma calendar** and the coordinator
  using the app is one of its admins (captain-confirmed with this decision),
  so Luma's own calendar-page "Add Event" panel is available to them.

## Decision

v1 is credential-free; the app reads public pages and hands the write to
Luma's own UI:

- **Preview** — one read-only GET of the pasted link's public page, parsed
  JSON-LD first, then OpenGraph, then the embedded page state; every field
  degrades on its own — except the "is this an event page at all?" question,
  which only the JSON-LD `Event` block or the page-state event object can
  answer: calendar and user pages serve an `og:title` too, so OpenGraph alone
  never earns a preview. The stable `evt-…` id and the canonical
  `https://luma.com/<slug>` URL are extracted for dedupe. Fetches go through
  Tauri's Rust-side HTTP plugin (`tauri-plugin-http`), because `luma.com`
  sends no CORS headers and the WebView CSP allows no remote origins; the
  capability scope permits only `https://luma.com/**`,
  `https://www.luma.com/**`, and `https://lu.ma/**`.
- **Best-effort duplicate check** — one read-only GET of the group calendar's
  public page, matching the pasted event against its embedded upcoming list
  by `evt-` id first, URL slug second. A hit renders as already-on-calendar
  (success tone, like the batch flow's "already on the list"), never an
  error. If the calendar page cannot be read, the screen says so and
  continues — the check never blocks the add.
- **Handoff, not write** — the CTA copies the event URL to the clipboard and
  deep-links the coordinator's browser to the calendar's own admin panel
  (`luma.com/calendar/manage/<id>`, "Add Existing Luma Event"), where they
  are signed in and are an admin; they paste, confirm. **The app never
  writes to Luma or the calendar.** All network in this flow is GETs of
  public pages, one fetch per pasted link plus one calendar-page read per
  check, with timeouts.
- Done-screen copy follows the ADR 0002 honesty pattern: it says the add now
  finishes in Luma, rather than claiming the calendar already shows the
  event.

## Rejected for v1

- **The full Luma API (Luma Plus, $59/month billed annually)** — one-tap add
  via `calendars/events/add` and authoritative dedupe via
  `calendars/events/lookup` are genuinely the better mechanism, at a
  recurring cost the captain declined for a flow that fires a few times a
  month. The upgrade is pre-scoped: fund Plus, generate the key in the
  calendar's settings, store it device-local (ADR 0003 posture), and replace
  `handOffLuma()`/`fetchCalendarEvents()` behind the seam. If Luma ever
  offers free-tier API keys, reprice this decision.
- **Cloning the event via `POST /v1/events/create`** — technically possible
  with Plus, semantically wrong: it creates a rival event page that splits
  RSVPs and misrepresents someone else's event as the group's own.
- **Driving Luma's web UI from the WebView (session automation)** — brittle
  and against the spirit of Luma ToS' "publicly supported interfaces"
  clause; the handoff uses the supported interface directly.

## Consequences

- The swap points live in `src/backend.js`, mirroring the ADR 0002 pattern:
  `handOffLuma()` is the single swap point for the add mechanism and
  `fetchCalendarEvents()` for the calendar read — which now serves two
  readers, this flow's dedupe check and Home's next-event card; a funded API
  upgrade replaces those functions only, without touching either screen.
  Parsing is pure and fixture-tested in `src/luma.js`.
- Two captain-confirmed facts are encoded in `src/backend.js`: the group's
  calendar is the Luma calendar `cal-v6H3Jm84BrwuOYb` (public slug
  `boardgamenightwg`, identified by resolving the id the group's website
  embeds; both live in the `GROUP_CALENDAR` constant), and the coordinator
  is an admin there — the handoff's two-tap finish depends on both. The
  group website's embed (`lu.ma/embed/calendar/<id>/events`) hydrates
  client-side with no usable server-rendered data, so the dedupe read uses
  the public slug page, which embeds the same upcoming list.
- Extraction is the fragile dependency: Luma can change their page markup.
  The JSON-LD-first chain and per-field degradation bound the blast radius,
  and the preview's error state is the visible failure mode.
- Events Luma forbids submitting (private, members-only, multi-session) also
  yield no metadata to an anonymous fetch; the preview error copy covers
  them.
