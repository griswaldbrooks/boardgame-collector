/* Board Game Night — Mailing List Collector (PWA)
 * Offline-first. One running list of sign-ups, stored on this device. */

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
  const countChip = $("countChip");
  const searchEl = $("search");
  const groupsBtn = $("groupsBtn");
  const toast = $("toast");

  // ---- state ----
  let entries = load();
  let query = "";
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
    } catch {
      showToast("⚠️ Could not save — storage full?");
    }
  }

  function signupDate(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  // ---- rendering ----
  function visible() {
    const q = query.trim().toLowerCase();
    const sorted = [...entries].sort((a, b) => b.ts - a.ts);
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        (e.name || "").toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.note || "").toLowerCase().includes(q)
    );
  }

  function render() {
    const total = entries.length;
    countChip.textContent = String(total);
    countLabel.textContent =
      total === 1 ? "1 on the list" : `${total} on the list`;

    const newCount = entries.filter((e) => !e.added).length;
    groupsBtn.style.display = total ? "block" : "none";
    groupsBtn.textContent =
      newCount > 0
        ? `✉️ Copy ${newCount} new for Google Groups`
        : "✉️ Copy all emails for Google Groups";

    const rows = visible();
    listEl.innerHTML = "";
    emptyState.style.display = total ? "none" : "block";
    searchEl.style.display = total > 8 ? "block" : "none";

    if (total && !rows.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.style.listStyle = "none";
      li.textContent = "No matches.";
      listEl.appendChild(li);
      return;
    }

    for (const e of rows) {
      const li = document.createElement("li");
      li.className = "list-item";

      const body = document.createElement("div");
      body.className = "item-body";

      const nm = document.createElement("div");
      nm.className = "item-name";
      nm.textContent = e.name || "(no name)";
      if (e.added) {
        const badge = document.createElement("span");
        badge.className = "added-badge";
        badge.textContent = "✓ in group";
        nm.appendChild(badge);
      }
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

    // Global dedupe — one entry per email across the whole list.
    const dupe = entries.find(
      (e) => e.email.toLowerCase() === email.toLowerCase()
    );
    if (dupe) {
      setMsg(`${email} is already on the list.`, "error");
      return;
    }

    const ts = Date.now();
    entries.push({
      id: `${ts}-${Math.round(performance.now())}`,
      name,
      email,
      note,
      date: signupDate(ts), // when they signed up (CSV metadata)
      ts,
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

  // ---- Google Groups: copy emails ready to paste into "Add members" ----
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function copyForGroups() {
    if (!entries.length) {
      showToast("No emails yet.");
      return;
    }
    const fresh = entries.filter((e) => !e.added);
    const batch = fresh.length ? fresh : entries; // none new → copy everyone
    const text = batch.map((e) => e.email).join(", ");

    const ok = await copyText(text);
    if (!ok) {
      // Last resort: share the text so they can paste it elsewhere.
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch {
          /* ignore */
        }
      } else {
        showToast("Couldn't copy — long-press to select in CSV instead.");
        return;
      }
    }

    if (fresh.length) {
      const ids = new Set(fresh.map((e) => e.id));
      entries.forEach((e) => {
        if (ids.has(e.id)) e.added = true;
      });
      save();
      render();
      showMarkedToast(fresh, batch.length);
    } else {
      showToast(`Copied all ${batch.length} — paste into Groups → Add members.`);
    }
  }

  function showMarkedToast(marked, count) {
    toast.innerHTML = "";
    toast.appendChild(
      document.createTextNode(`${count} copied & marked ✓ — paste into Groups`)
    );
    const link = document.createElement("span");
    link.className = "undo-link";
    link.textContent = "Undo";
    toast.appendChild(link);
    toast.className = "toast show undo";
    const onUndo = () => {
      const ids = new Set(marked.map((e) => e.id));
      entries.forEach((e) => {
        if (ids.has(e.id)) e.added = false;
      });
      save();
      render();
      toast.removeEventListener("click", onUndo);
      hideToast();
    };
    toast.addEventListener("click", onUndo);
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideToast, 6000);
  }

  // ---- CSV export ----
  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function buildCsv(rows) {
    const head = ["name", "email", "note", "signed_up_on", "signed_up_at", "in_google_group"];
    const lines = [head.join(",")];
    for (const e of rows) {
      lines.push(
        [
          csvCell(e.name),
          csvCell(e.email),
          csvCell(e.note),
          csvCell(e.date),
          csvCell(new Date(e.ts).toISOString()),
          e.added ? "yes" : "no",
        ].join(",")
      );
    }
    return lines.join("\r\n");
  }

  async function exportList() {
    const rows = [...entries].sort((a, b) => a.ts - b.ts);
    if (!rows.length) {
      showToast("Nothing to export yet.");
      return;
    }
    const csv = buildCsv(rows);
    const fname = "bgn-mailing-list.csv";
    const file = new File([csv], fname, { type: "text/csv" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Board Game Night mailing list",
          text: `${rows.length} sign-up${rows.length === 1 ? "" : "s"}`,
        });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // user cancelled
      }
    }
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
  searchEl.addEventListener("input", () => {
    query = searchEl.value;
    render();
  });
  $("exportBtn").addEventListener("click", exportList);
  groupsBtn.addEventListener("click", copyForGroups);

  render();

  // ---- service worker ----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
