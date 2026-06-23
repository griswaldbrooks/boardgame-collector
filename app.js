/* Board Game Night — Email Collector (PWA)
 * Offline-first. All data lives in localStorage on this device. */

(() => {
  "use strict";

  const STORE_KEY = "bgnwg.entries.v1";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---- elements ----
  const $ = (id) => document.getElementById(id);
  const form = $("entryForm");
  const nameEl = $("name");
  const emailEl = $("email");
  const noteEl = $("note");
  const formMsg = $("formMsg");
  const listEl = $("list");
  const emptyState = $("emptyState");
  const countLabel = $("countLabel");
  const allCount = $("allCount");
  const dateInput = $("dateInput");
  const dateLabel = $("dateLabel");
  const toast = $("toast");

  // ---- state ----
  let entries = load();
  let activeDate = todayKey();
  let lastDeleted = null;
  let undoTimer = null;

  // ---- storage ----
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch (e) {
      showToast("⚠️ Could not save — storage full?");
    }
  }

  // ---- dates ----
  function todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function prettyDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const opts = { weekday: "short", month: "short", day: "numeric" };
    const label = dt.toLocaleDateString(undefined, opts);
    return key === todayKey() ? `Tonight · ${label}` : label;
  }

  // ---- rendering ----
  function entriesFor(dateKey) {
    return entries
      .filter((e) => e.date === dateKey)
      .sort((a, b) => b.ts - a.ts);
  }

  function render() {
    dateInput.value = activeDate;
    dateLabel.textContent = prettyDate(activeDate);
    allCount.textContent = String(entries.length);

    const todays = entriesFor(activeDate);
    countLabel.textContent =
      todays.length === 1 ? "1 collected" : `${todays.length} collected`;

    listEl.innerHTML = "";
    emptyState.style.display = todays.length ? "none" : "block";

    for (const e of todays) {
      const li = document.createElement("li");
      li.className = "list-item";

      const body = document.createElement("div");
      body.className = "item-body";

      const nm = document.createElement("div");
      nm.className = "item-name";
      nm.textContent = e.name || "(no name)";
      body.appendChild(nm);

      const em = document.createElement("div");
      em.className = "item-email";
      em.textContent = e.email;
      body.appendChild(em);

      if (e.note) {
        const nt = document.createElement("div");
        nt.className = "item-note";
        nt.textContent = e.note;
        body.appendChild(nt);
      }

      const del = document.createElement("button");
      del.className = "del-btn";
      del.type = "button";
      del.setAttribute("aria-label", `Remove ${e.email}`);
      del.textContent = "✕";
      del.addEventListener("click", () => removeEntry(e.id));

      li.appendChild(body);
      li.appendChild(del);
      listEl.appendChild(li);
    }
  }

  // ---- add / remove ----
  function addEntry(ev) {
    ev.preventDefault();
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const note = noteEl.value.trim();

    if (!EMAIL_RE.test(email)) {
      emailEl.classList.add("invalid");
      setMsg("Enter a valid email address.", "error");
      emailEl.focus();
      return;
    }
    emailEl.classList.remove("invalid");

    const dupe = entries.find(
      (e) => e.date === activeDate && e.email.toLowerCase() === email.toLowerCase()
    );
    if (dupe) {
      setMsg(`${email} is already on tonight's list.`, "error");
      return;
    }

    entries.push({
      id: `${Date.now()}-${Math.round(performance.now())}`,
      name,
      email,
      note,
      date: activeDate,
      ts: Date.now(),
    });
    save();
    render();

    form.reset();
    setMsg(`Added ${name || email} ✓`, "ok");
    nameEl.focus();
  }

  function removeEntry(id) {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    lastDeleted = entries[idx];
    entries.splice(idx, 1);
    save();
    render();
    showUndoToast(`Removed ${lastDeleted.name || lastDeleted.email}`);
  }

  function undoDelete() {
    if (!lastDeleted) return;
    entries.push(lastDeleted);
    lastDeleted = null;
    save();
    render();
    hideToast();
  }

  // ---- messages / toast ----
  function setMsg(text, kind) {
    formMsg.textContent = text;
    formMsg.className = "form-msg" + (kind ? " " + kind : "");
    if (kind === "ok") {
      setTimeout(() => {
        if (formMsg.textContent === text) {
          formMsg.textContent = "";
          formMsg.className = "form-msg";
        }
      }, 2500);
    }
  }

  let toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.className = "toast show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 2600);
  }
  function showUndoToast(text) {
    toast.innerHTML = "";
    toast.appendChild(document.createTextNode(text));
    const link = document.createElement("span");
    link.className = "undo-link";
    link.textContent = "Undo";
    toast.appendChild(link);
    toast.className = "toast show undo";
    const onUndo = () => {
      undoDelete();
      toast.removeEventListener("click", onUndo);
    };
    toast.addEventListener("click", onUndo);
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      lastDeleted = null;
      hideToast();
    }, 5000);
  }
  function hideToast() {
    toast.className = "toast";
  }

  // ---- CSV export ----
  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function buildCsv(rows) {
    const head = ["name", "email", "note", "event_date", "collected_at"];
    const lines = [head.join(",")];
    for (const e of rows) {
      lines.push(
        [
          csvCell(e.name),
          csvCell(e.email),
          csvCell(e.note),
          csvCell(e.date),
          csvCell(new Date(e.ts).toISOString()),
        ].join(",")
      );
    }
    return lines.join("\r\n");
  }

  async function exportRows(rows, label) {
    if (!rows.length) {
      showToast("Nothing to export yet.");
      return;
    }
    const csv = buildCsv(rows);
    const fname = `bgn-emails-${label}.csv`;
    const file = new File([csv], fname, { type: "text/csv" });

    // Prefer native share sheet (mobile) when files are supported.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Board Game Night sign-ups",
          text: `${rows.length} email${rows.length === 1 ? "" : "s"}`,
        });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // user cancelled
        // otherwise fall through to download
      }
    }
    // Fallback: download the file.
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("CSV saved to your downloads.");
  }

  // ---- wire up ----
  form.addEventListener("submit", addEntry);
  emailEl.addEventListener("input", () => emailEl.classList.remove("invalid"));

  dateInput.addEventListener("change", () => {
    if (dateInput.value) {
      activeDate = dateInput.value;
      render();
    }
  });

  $("exportBtn").addEventListener("click", () =>
    exportRows(entriesFor(activeDate), activeDate)
  );
  $("exportAllBtn").addEventListener("click", () =>
    exportRows([...entries].sort((a, b) => a.ts - b.ts), "all")
  );

  render();

  // ---- service worker ----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
