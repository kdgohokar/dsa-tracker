// ── Entry point / orchestrator ────────────────────────────────────────
// Wires the modules together: Firebase auth → Firestore subscription →
// state → render. Feature modules below are imported for their side effects
// (they register window.* onclick handlers and DOM event listeners on load).
import { state } from "./state.js";
import { html, renderTo } from "./dom.js";
import { isDue } from "./model.js";
import {
  auth,
  db,
  onAuthStateChanged,
  onSnapshot,
  collection,
  query,
  orderBy,
} from "./firebase.js";
import { setSyncing, setOffline } from "./ui.js";
import { renderHeatmap } from "./heatmap.js";
import { renderDue, startDueTimer, stopDueTimer } from "./due.js";
import { renderAll, renderPatterns } from "./lists.js";
import "./edit.js"; // openEdit / saveEdit / closeEdit + modal wiring
import "./logform.js"; // addProblem / selectDiff + form wiring

// ── Auth state listener ───────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  document.getElementById("loading-screen").style.display = "none";
  if (user) {
    state.currentUid = user.uid;
    showApp(user);
    subscribeToProblems(user.uid);
  } else {
    state.currentUid = null;
    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = null;
    }
    state.entries = [];
    state.landed = false;
    document.getElementById("app").style.display = "none";
    document.getElementById("auth-screen").style.display = "flex";
  }
});

function showApp(user) {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  // Avatar
  const av = document.getElementById("user-avatar");
  if (user.photoURL) {
    renderTo(
      av,
      html`<img src="${user.photoURL}" alt="${user.displayName || "User"}" />`,
    );
  } else {
    av.textContent = (user.displayName || user.email || "U")[0].toUpperCase();
  }
}

// ── Firestore real-time listener ──────────────────────────────────────
function subscribeToProblems(uid) {
  setSyncing(true);
  const q = query(
    collection(db, "users", uid, "problems"),
    orderBy("solvedAt", "desc"),
  );
  state.unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      state.entries = snapshot.docs.map((d) => ({
        firestoreId: d.id,
        ...d.data(),
      }));
      setSyncing(false);
      // Land where the work is: Due if anything's waiting, Log if the
      // tracker is empty, otherwise stay on the Retention map.
      if (!state.landed) {
        state.landed = true;
        if (state.entries.filter(isDue).length > 0) window.switchTab("due");
        else if (state.entries.length === 0) window.switchTab("log");
      }
      refreshAll();
    },
    (err) => {
      console.error(err);
      setOffline();
    },
  );
}

function refreshAll() {
  updateStats();
  const active = document.querySelector(".panel.active");
  if (active?.id === "panel-heatmap") renderHeatmap();
  if (active?.id === "panel-due") renderDue();
  if (active?.id === "panel-all") renderAll();
  if (active?.id === "panel-patterns") renderPatterns();
}

function updateStats() {
  const due = state.entries.filter(isDue).length;
  document.getElementById("hs-total").textContent = state.entries.length;
  document.getElementById("hs-due").textContent = due;
  document.getElementById("hs-owned").textContent = state.entries.filter(
    (e) => e.reviews >= 4,
  ).length;
  const badge = document.getElementById("due-badge");
  badge.textContent = due;
  badge.style.display = due > 0 ? "inline-flex" : "none";
}

// ── Tab switching ─────────────────────────────────────────────────────
window.switchTab = (id, btn) => {
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  // `btn` is the clicked element; when called programmatically (e.g. the
  // initial landing tab) look it up by its data-tab attribute instead.
  const navBtn = btn || document.querySelector(`.nav-btn[data-tab="${id}"]`);
  if (navBtn) navBtn.classList.add("active");
  document.getElementById("panel-" + id).classList.add("active");
  if (id === "heatmap") renderHeatmap();
  if (id === "due") {
    renderDue();
    startDueTimer();
  } else {
    stopDueTimer();
  }
  if (id === "all") renderAll();
  if (id === "patterns") renderPatterns();
};
