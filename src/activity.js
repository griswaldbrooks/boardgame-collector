// Recent activity: append-only local log of coordinator actions, newest
// first. The spec's "Real data needed" notes the source of truth is future
// work; until then this local log backs Home's Recent list.

const KEY = "bgn.activity.v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

export function addActivity(what) {
  const log = [{ ts: Date.now(), what }, ...load()].slice(0, 50);
  localStorage.setItem(KEY, JSON.stringify(log));
}

export function listActivity() {
  return load();
}

// Spec labels: Today / Mon / Jul 24.
export function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((startOf(now) - startOf(d)) / 864e5);
  if (daysAgo <= 0) return "Today";
  if (daysAgo < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
