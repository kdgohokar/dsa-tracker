// ── Toast & connection indicators ─────────────────────────────────────

// Show a toast. Pass an actionLabel + actionFn to add an inline button
// (e.g. "Undo"); action toasts linger longer so there's time to click.
export function showToast(msg, actionLabel, actionFn) {
  const t = document.getElementById("toast");
  clearTimeout(t._timer);
  const hasAction = actionLabel && actionFn;
  t.innerHTML = `<span class="toast-msg"></span>${
    hasAction
      ? '<button class="toast-action" type="button"></button>'
      : ""
  }`;
  t.querySelector(".toast-msg").textContent = msg;
  if (hasAction) {
    const btn = t.querySelector(".toast-action");
    btn.textContent = actionLabel;
    btn.onclick = () => {
      clearTimeout(t._timer);
      t.classList.remove("show");
      actionFn();
    };
  }
  t.classList.add("show");
  t._timer = setTimeout(
    () => t.classList.remove("show"),
    hasAction ? 6000 : 2600,
  );
}

// ── Sync indicator ────────────────────────────────────────────────────
export function setSyncing(v) {
  const dot = document.getElementById("sync-dot");
  const lbl = document.getElementById("sync-label");
  dot.className = "sync-dot" + (v ? " syncing" : "");
  lbl.textContent = v ? "Syncing…" : "Synced";
}
export function setOffline() {
  document.getElementById("sync-dot").className = "sync-dot offline";
  document.getElementById("sync-label").textContent = "Offline";
}
window.addEventListener("offline", setOffline);
window.addEventListener("online", () => setSyncing(false));
if (!navigator.onLine) setOffline();
