// Flow 3 (Add a community Luma event): URL normalization, event-page
// extraction, and calendar dedupe matching. Pure string in / object out —
// the network read lives at the backend.js seam, so all of this is testable
// against fixtures (docs/adr/0004-credential-free-luma-handoff.md).
//
// Extraction chain, most stable first: schema.org JSON-LD (Luma serves it
// for search rich-results), OpenGraph tags, then the embedded __NEXT_DATA__
// page state (richest — the only source of the stable evt-… id and the
// Luma categories — but the first to move when Luma changes their stack).
// Every field degrades on its own: render whatever survives.

// "lu.ma/x", "https://www.luma.com/x?utm_campaign=z#live" → "https://luma.com/x"
// (lu.ma 301s to luma.com; canonical og:url is luma.com — normalize before
// preview and dedupe). Null when the pasted text is not a Luma link.
export function normalizeLumaUrl(raw) {
  const m = String(raw)
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.)?(?:lu\.ma|luma\.com)\//i);
  if (!m) return null;
  const slug = String(raw)
    .trim()
    .slice(m[0].length)
    .split(/[/?#\s]/)[0];
  return slug ? `https://luma.com/${slug}` : null;
}

export const slugOf = (url) => normalizeLumaUrl(url)?.split("/").pop() ?? null;

function jsonLdEvent(html) {
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let block;
    try {
      block = JSON.parse(m[1]);
    } catch {
      continue; // a malformed sibling block must not sink the others
    }
    const items = Array.isArray(block)
      ? block
      : block["@graph"]
        ? block["@graph"]
        : [block];
    const ev = items.find((it) => it?.["@type"] === "Event");
    if (ev) return ev;
  }
  return null;
}

function ogTags(html) {
  const pick = (prop) => {
    const m =
      html.match(
        new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`, "i"),
      ) ??
      html.match(
        new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${prop}"`, "i"),
      );
    return m ? m[1] : null;
  };
  return {
    title: pick("og:title"),
    image: pick("og:image"),
    url: pick("og:url"),
  };
}

function nextData(html) {
  const m = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.props?.pageProps?.initialData?.data ?? null;
  } catch {
    return null;
  }
}

const trimmed = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

// Preview of a pasted event link. Returns { isEvent, title, startAt, timezone,
// venue, tags, cover, eventId, url } with any field null/empty when its source
// is missing. `isEvent` is the one non-degrading field: only an actual event
// page carries a JSON-LD Event block or a page-state event object, so a
// calendar/user page pasted by mistake reads as not-an-event even though it
// serves an og:title.
export function parseEventPage(html) {
  const ld = jsonLdEvent(html);
  const og = ogTags(html);
  const data = nextData(html);
  const ev = data?.event;

  const venue =
    (ev?.geo_address_info &&
      ev.geo_address_info.mode !== "obfuscated" &&
      ev.geo_address_info.address) ||
    ld?.location?.name ||
    ev?.geo_address_info?.city_state ||
    ev?.geo_address_info?.city ||
    null;

  return {
    isEvent: Boolean(ld || ev),
    title:
      trimmed(ld?.name) ??
      trimmed(og.title?.replace(/\s*·\s*Luma$/i, "")) ??
      trimmed(ev?.name),
    startAt: ld?.startDate ?? ev?.start_at ?? null,
    // IANA zone only comes from the page state; JSON-LD carries the event's
    // wall time as an offset instead (rendered without a zone name).
    timezone: ev?.timezone ?? null,
    venue,
    tags: (data?.categories ?? []).map((c) => c?.name).filter(Boolean),
    cover:
      ev?.cover_url ??
      ev?.social_image_url ??
      [].concat(ld?.image ?? [])[0] ??
      og.image ??
      null,
    eventId:
      typeof ev?.api_id === "string" && ev.api_id.startsWith("evt-")
        ? ev.api_id
        : null,
    url: normalizeLumaUrl(
      ld?.url ?? og.url ?? (ev?.url ? `https://luma.com/${ev.url}` : ""),
    ),
  };
}

// Wall time of the event in its own timezone, rendered spec-style:
// "Thu Aug 13 · 7:00 pm". Offset-bearing ISO (JSON-LD) carries the wall
// time in the string itself; UTC + IANA zone (page state) needs a zoned
// format. Returns null when there is nothing to render.
export function formatWhen(startAt, timezone) {
  const m = String(startAt ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/,
  );
  if (!m) return null;
  let parts;
  if (m[6] && m[6] !== "Z") {
    // Wall time is right there in the string — no conversion needed.
    parts = {
      weekday: null,
      month: null,
      day: +m[3],
      hour: +m[4],
      minute: m[5],
    };
  } else {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: m[6] === "Z" && timezone ? timezone : undefined,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      parts = Object.fromEntries(
        fmt.formatToParts(new Date(startAt)).map((p) => [p.type, p.value]),
      );
    } catch {
      return null;
    }
  }
  if (parts.weekday == null) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`); // weekday/month names only
    parts.weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    parts.month = d.toLocaleDateString("en-US", { month: "short" });
  }
  const hour12 = parts.hour % 12 || 12;
  const minute = String(parts.minute).padStart(2, "0");
  const ampm = parts.dayPeriod ?? (parts.hour < 12 ? "am" : "pm");
  return `${parts.weekday} ${parts.month} ${parts.day} · ${hour12}:${minute} ${String(ampm).toLowerCase()}`;
}

// Upcoming events embedded in the group calendar's public page — the
// credential-free dedupe source. Best-effort by construction: anything
// unparseable yields [], which the screen renders as "couldn't check".
export function parseCalendarEvents(html) {
  const data = nextData(html);
  if (!data) return [];
  // featured_items sits at initialData.data on the calendars probed; fall
  // back to a shallow scan so a re-nested key degrades instead of breaking.
  const looksRight = (xs) =>
    Array.isArray(xs) && xs.some((it) => it?.event?.api_id || it?.event?.url);
  const items = looksRight(data.featured_items)
    ? data.featured_items
    : (Object.values(data).find((v) => Array.isArray(v) && looksRight(v)) ??
      []);
  return items
    .map((it) => {
      // event.url is a slug for Luma events, a full URL for external-platform
      // entries (which then dedupe by id only).
      const u = it?.event?.url ?? it?.url ?? null;
      return {
        eventId: typeof it?.event?.api_id === "string" ? it.event.api_id : null,
        slug:
          u && /^https?:\/\//i.test(u)
            ? slugOf(u)
            : slugOf(u ? `https://luma.com/${u}` : null),
        name: it?.name ?? it?.event?.name ?? null,
      };
    })
    .filter((e) => e.eventId || e.slug);
}

// Match the pasted event against the calendar's upcoming list: stable evt-…
// id first, URL slug second. Returns the matching entry or null.
export function findDuplicate(preview, entries) {
  const slug = slugOf(preview?.url ?? "");
  return (
    entries.find((e) => preview?.eventId && e.eventId === preview.eventId) ??
    entries.find((e) => slug && e.slug === slug) ??
    null
  );
}
