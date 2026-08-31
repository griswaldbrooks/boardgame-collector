# 8. Events page — a separate scrollable page, not expand-in-place

Date: 2026-08-31

## Status

Accepted (captain decision, 2026-08-31).

## Context

Home's next-event card shows only the soonest not-ended event on the group's
calendar. Coordinators also need the whole upcoming list. Two shapes were on
the table: expand the Home card in place (expand/contract the list inside the
card), or navigate to a dedicated page.

## Decision

Home's next-event card is tappable and opens a separate **Events** screen
listing all upcoming events — scrollable, one card per event, with every
detail the public calendar surface carries (name, date/time range, venue,
RSVP count when public, days-out pill).

The captain explicitly considered and **rejected** the expand/contract-in-place
alternative. Home stays the two-second orientation surface — one event, then
the actions. Do not re-litigate this choice without new information.

The page consumes the same credential-free source as the card —
`fetchCalendarEvents()` and the `bgn.calendar.v1` device cache in
`src/backend.js` (`docs/adr/0004-credential-free-luma-handoff.md`), one fresh
read per page entry. Nothing new is fetched: the list is
`upcomingEvents()` over the existing entry shape. Offline-first parity with
the card: the cached list renders instantly, stale data is always marked
(`Last known — pulled …` in flight, `Couldn't reach the calendar — pulled …`
after a failed read), and the empty / couldn't-reach states are as honest as
the card's.

## Consequences

- New `events` value in the navigation stack: Home → Events, with the
  header Cancel (and Android back) returning to Home.
- The Home card carries the event name and a chevron to advertise the tap;
  it stays compact — full detail lives on the page, not the card.
- A richer event source later (funded Luma key) swaps `src/backend.js`
  and nothing else, exactly as for the card.
