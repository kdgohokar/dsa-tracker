import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAnalytics,
  logEvent,
  isSupported as analyticsSupported,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// ─────────────────────────────────────────────────────────────────────
// STEP 1: Replace this config with your own Firebase project config.
// Get it from: Firebase Console → Project Settings → Your apps → SDK setup
// ─────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAD0BBunL0daIx6gDt0mIFwI9-QAXDIXmw",
  authDomain: "dsa-tracker-c9277.firebaseapp.com",
  projectId: "dsa-tracker-c9277",
  storageBucket: "dsa-tracker-c9277.firebasestorage.app",
  messagingSenderId: "567473178464",
  appId: "1:567473178464:web:1230458eea9e92d9744005",
  measurementId: "G-PDVTE010ER",
};

const app = initializeApp(firebaseConfig);

// ── App Check (reCAPTCHA v3) ──────────────────────────────────────────
// The site key is PUBLIC and safe to commit. Generate the key pair in:
//   Firebase Console → App Check → Apps → register this app w/ reCAPTCHA v3
//   (add domains dsa-tracker-c9277.web.app, .firebaseapp.com, localhost).
// The matching reCAPTCHA SECRET key is entered in that console, never here.
// App Check is initialized BEFORE other Firebase services so its tokens
// attach to Auth/Firestore requests.
const RECAPTCHA_V3_SITE_KEY = "6LeeuBUtAAAAAPJCCSCEy1uj4jYMlMSf0U2WATAS";

// Local dev: prints a debug token to the console — register it under
// App Check → Debug tokens so localhost works without a real challenge.
if (
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1"
) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// Stays inert until a real site key is set, so deploys never break before
// App Check is fully configured/enforced in the console.
if (!RECAPTCHA_V3_SITE_KEY.startsWith("REPLACE_")) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

const auth = getAuth(app);
// Offline persistence with multi-tab sync
// (replaces the deprecated, single-tab enableIndexedDbPersistence)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
const provider = new GoogleAuthProvider();

// ── Analytics ─────────────────────────────────────────────────────────
// GA4 auto-collects page_view / session events. We add a guarded helper
// for the app's own events. isSupported() avoids errors in environments
// where Analytics can't run (private mode, blocked storage); track() then
// safely no-ops and never throws into app logic.
let analytics = null;
analyticsSupported()
  .then((ok) => {
    if (ok) analytics = getAnalytics(app);
  })
  .catch(() => {});
function track(name, params) {
  try {
    if (analytics) logEvent(analytics, name, params);
  } catch (e) {
    /* analytics must never break the app */
  }
}

// ── Expose auth functions to global scope for onclick handlers ────────
window.signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, provider);
    track("login", { method: "google" });
  } catch (e) {
    showToast("Sign-in failed: " + e.message);
  }
};

window.signOut = async () => {
  track("logout");
  if (unsubscribe) unsubscribe();
  await fbSignOut(auth);
};

// ── SRS config ───────────────────────────────────────────────────────
// Fixed review schedule (days), matching the SRS guide stages:
//   0=R1 (+1d), 1=R2 (+3d), 2=R3 (+7d), 3=R4 (+21d), 4=Maint (monthly)
const STAGE_DAYS = [1, 3, 7, 21, 30];
const MAINT = STAGE_DAYS.length - 1;

// Given the current stage and how the review felt, return the next stage.
// "Easy"/"Medium" promote one stage; "Hard" demotes per the guide's
// "if hard" column: R1→R1, R2→R1, R3→R2, R4→Maint, Maint→R3.
function nextStage(stage, felt) {
  if (felt === "hard") return [0, 0, 1, MAINT, 2][stage];
  return Math.min(stage + 1, MAINT);
}

// HTML-escape user-supplied strings before injecting into innerHTML
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

// ── Pattern taxonomy ──────────────────────────────────────────────────
// Fixed list of DSA patterns offered in the Log/Edit selectors and used to
// group the Patterns tab. DP is the only pattern with sub-types (1D/2D/3D).
const PATTERNS = [
  "Arrays/HashMap",
  "2 Pointers",
  "Sliding Window",
  "Stack",
  "Binary Search",
  "Linked List",
  "Tree",
  "Trie",
  "Heap / Priority Queue",
  "Backtracking",
  "Graph",
  "DP",
  "Greedy",
  "Intervals",
  "Math",
  "Bit Manipulation",
];
const DP_SUBTYPES = ["1D", "2D", "3D"];
const UNCATEGORIZED = "Uncategorized";

// Display label for a problem's pattern. The structured category wins; DP
// shows its sub-type (e.g. "DP · 2D"). Falls back to the legacy free-text
// `pattern` value (pre-feature problems), then to "".
function patternLabel(e) {
  if (e.category) {
    return e.category === "DP" && e.subCategory
      ? `${e.category} · ${e.subCategory}`
      : e.category;
  }
  return e.pattern || "";
}

// Optional free-text note shown alongside a problem. New problems store it in
// `note`. Older problems only had the free-text `pattern`; once that's been
// replaced by a structured `category` the old text would otherwise vanish, so
// surface it here as the note (it stays in `pattern` until the next Edit, when
// it's persisted into `note`).
function noteOf(e) {
  if (e.note) return e.note;
  if (e.category && e.pattern) return e.pattern;
  return "";
}

// ── State ─────────────────────────────────────────────────────────────
let entries = [];
let selectedDiff = null;
let unsubscribe = null;
let currentUid = null;
let chartDrawn = false;
let landed = false; // have we picked the initial tab this session?

// ── Auth state listener ───────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  document.getElementById("loading-screen").style.display = "none";
  if (user) {
    currentUid = user.uid;
    showApp(user);
    subscribeToProblems(user.uid);
  } else {
    currentUid = null;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    entries = [];
    landed = false;
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
    av.innerHTML = `<img src="${esc(user.photoURL)}" alt="${esc(user.displayName) || "User"}">`;
  } else {
    av.textContent = (user.displayName ||
      user.email ||
      "U")[0].toUpperCase();
  }
}

// ── Firestore real-time listener ──────────────────────────────────────
function subscribeToProblems(uid) {
  setSyncing(true);
  const q = query(
    collection(db, "users", uid, "problems"),
    orderBy("solvedAt", "desc"),
  );
  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      entries = snapshot.docs.map((d) => ({
        firestoreId: d.id,
        ...d.data(),
      }));
      setSyncing(false);
      // Land where the work is: Due if anything's waiting, Log if the
      // tracker is empty, otherwise stay on the Retention map.
      if (!landed) {
        landed = true;
        if (entries.filter(isDue).length > 0) window.switchTab("due");
        else if (entries.length === 0) window.switchTab("log");
      }
      refreshAll();
    },
    (err) => {
      console.error(err);
      setOffline();
    },
  );
}

// ── Sync indicator ────────────────────────────────────────────────────
function setSyncing(v) {
  const dot = document.getElementById("sync-dot");
  const lbl = document.getElementById("sync-label");
  dot.className = "sync-dot" + (v ? " syncing" : "");
  lbl.textContent = v ? "Syncing…" : "Synced";
}
function setOffline() {
  document.getElementById("sync-dot").className = "sync-dot offline";
  document.getElementById("sync-label").textContent = "Offline";
}
window.addEventListener("offline", setOffline);
window.addEventListener("online", () => setSyncing(false));
if (!navigator.onLine) setOffline();

// ── Retention model ───────────────────────────────────────────────────
function calcRetention(e) {
  const daysSince = (Date.now() - e.lastReviewAt) / 86400000;
  const stability = STAGE_DAYS[Math.min(e.reviews, MAINT)];
  return Math.max(
    0,
    Math.min(1, Math.exp((-0.693 * daysSince) / stability)),
  );
}
function rColor(r) {
  if (r > 0.75) return `rgba(46,204,138,${0.15 + r * 0.5})`;
  if (r > 0.4) return `rgba(245,166,35,${0.15 + r * 0.5})`;
  return `rgba(232,93,93,${0.2 + (1 - r) * 0.4})`;
}
function rTextColor(r) {
  if (r > 0.75) return "rgba(46,204,138,0.85)";
  if (r > 0.4) return "rgba(245,166,35,0.85)";
  return "rgba(232,93,93,0.85)";
}

// ── Helpers ───────────────────────────────────────────────────────────
const until = (ts) => {
  const d = Math.round((ts - Date.now()) / 86400000);
  if (d < 0)
    return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
};
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
const revLabel = (n) =>
  ["R1", "R2", "R3", "R4", "Maint."][Math.min(n, 4)];
// A problem becomes due on its scheduled calendar day — review it anytime
// that day, not at the exact timestamp it was logged. The 12h floor since the
// last review stops two reviews collapsing into one session, which would
// defeat the spacing. (Every interval is >= 1 day, so this never blocks an
// on-time review; it only blocks same-day cramming on the 1-day step.)
const MIN_GAP_MS = 12 * 3600000;
// How far ahead the Due tab previews upcoming problems (shown locked).
const SOON_WINDOW_MS = 12 * 3600000;
const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// The exact moment a problem unlocks for review: the later of its scheduled
// calendar day and the 12h floor since the last review.
const dueAt = (e) =>
  Math.max(startOfDay(e.nextReview), e.lastReviewAt + MIN_GAP_MS);
const isDue = (e) => Date.now() >= dueAt(e);
// Human countdown until `ms` from now elapses: "HH:MM hours" while an hour or
// more remains, otherwise "M minutes".
const fmtCountdown = (ms) => {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins >= 60) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m} hours`;
  }
  if (mins === 0) return "<1 minute";
  return `${mins} minute${mins === 1 ? "" : "s"}`;
};

// ── UI helpers ────────────────────────────────────────────────────────
// Show a toast. Pass an actionLabel + actionFn to add an inline button
// (e.g. "Undo"); action toasts linger longer so there's time to click.
function showToast(msg, actionLabel, actionFn) {
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

function refreshAll() {
  updateStats();
  const active = document.querySelector(".panel.active");
  if (active?.id === "panel-heatmap") renderHeatmap();
  if (active?.id === "panel-due") renderDue();
  if (active?.id === "panel-all") renderAll();
  if (active?.id === "panel-patterns") renderPatterns();
}

function updateStats() {
  const due = entries.filter(isDue).length;
  document.getElementById("hs-total").textContent = entries.length;
  document.getElementById("hs-due").textContent = due;
  document.getElementById("hs-owned").textContent = entries.filter(
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
  const navBtn =
    btn || document.querySelector(`.nav-btn[data-tab="${id}"]`);
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

// ── Form ──────────────────────────────────────────────────────────────
// Populate a <select> from a list of values, with an optional leading
// placeholder. A disabled placeholder forces a real choice (required field).
function fillSelect(id, values, placeholder, placeholderDisabled) {
  const sel = document.getElementById(id);
  const ph = placeholder
    ? `<option value=""${
        placeholderDisabled ? " disabled" : ""
      } selected>${esc(placeholder)}</option>`
    : "";
  sel.innerHTML =
    ph +
    values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}
// Log form requires a pattern (disabled placeholder); the edit form lets a
// problem stay Uncategorized (selectable blank) so legacy ones aren't forced.
fillSelect("f-pattern", PATTERNS, "Select pattern…", true);
fillSelect("f-subtype", DP_SUBTYPES, "Select…", true);
fillSelect("edit-pattern", PATTERNS, UNCATEGORIZED, false);
fillSelect("edit-subtype", DP_SUBTYPES, "Select…", true);

// Submit is enabled only with a name, a difficulty, a pattern, and — when
// the pattern is DP — a sub-type.
function updateLogValidity() {
  const name = document.getElementById("f-name").value.trim();
  const pattern = document.getElementById("f-pattern").value;
  const sub = document.getElementById("f-subtype").value;
  const ok =
    !!name && !!selectedDiff && !!pattern && (pattern !== "DP" || !!sub);
  document.getElementById("submit-btn").disabled = !ok;
}

// Show the DP sub-type field only when DP is the chosen pattern.
function syncSubtypeVisibility() {
  const isDP = document.getElementById("f-pattern").value === "DP";
  document.getElementById("f-subtype-wrap").style.display = isDP ? "" : "none";
  if (!isDP) document.getElementById("f-subtype").selectedIndex = 0;
}

window.selectDiff = (d) => {
  selectedDiff = d;
  ["easy", "medium", "hard"].forEach((x) => {
    document.getElementById("db-" + x).className =
      "diff-btn" + (d === x ? " sel-" + x : "");
  });
  updateLogValidity();
};

document
  .getElementById("f-name")
  .addEventListener("input", updateLogValidity);
document.getElementById("f-pattern").addEventListener("change", () => {
  syncSubtypeVisibility();
  updateLogValidity();
});
document
  .getElementById("f-subtype")
  .addEventListener("change", updateLogValidity);

window.addProblem = async () => {
  const name = document.getElementById("f-name").value.trim();
  const category = document.getElementById("f-pattern").value;
  const subCategory =
    category === "DP" ? document.getElementById("f-subtype").value : "";
  const note = document.getElementById("f-note").value.trim();
  const source = document.getElementById("f-source").value;
  if (!name || !selectedDiff || !category || !currentUid) return;
  if (category === "DP" && !subCategory) return;

  const diff = selectedDiff;
  const now = Date.now();
  const doc_data = {
    name,
    category,
    subCategory,
    note,
    source,
    diff,
    reviews: 0,
    solvedAt: now,
    lastReviewAt: now,
    nextReview: now + STAGE_DAYS[0] * 86400000,
    createdAt: serverTimestamp(),
  };

  setSyncing(true);
  try {
    await addDoc(
      collection(db, "users", currentUid, "problems"),
      doc_data,
    );
    showToast(
      `"${name}" logged — R1 due ${until(doc_data.nextReview).toLowerCase()}`,
    );
    track("log_problem", { difficulty: diff, source, pattern: category });
    // Reset form
    document.getElementById("f-name").value = "";
    document.getElementById("f-pattern").selectedIndex = 0;
    document.getElementById("f-note").value = "";
    syncSubtypeVisibility();
    selectedDiff = null;
    ["easy", "medium", "hard"].forEach(
      (x) => (document.getElementById("db-" + x).className = "diff-btn"),
    );
    document.getElementById("submit-btn").disabled = true;
  } catch (e) {
    showToast("Error saving: " + e.message);
    setSyncing(false);
  }
};

// ── Heatmap ───────────────────────────────────────────────────────────
const tooltip = document.getElementById("tooltip");

function fillTooltip(e, r) {
  document.getElementById("tt-name").textContent = e.name;
  document.getElementById("tt-pat").textContent =
    patternLabel(e) || "No pattern tagged";
  document.getElementById("tt-ret").textContent =
    `Retention: ${Math.round(r * 100)}% · ${revLabel(e.reviews)}`;
  document.getElementById("tt-nxt").textContent =
    `Next review: ${until(e.nextReview)}`;
  const ttNote = document.getElementById("tt-note");
  const note = noteOf(e);
  ttNote.textContent = note;
  ttNote.style.display = note ? "" : "none";
  tooltip.classList.add("show");
}
// Position the (fixed) tooltip near a point, clamped to the viewport
function placeTooltip(x, y) {
  const tw = tooltip.offsetWidth || 200;
  const th = tooltip.offsetHeight || 90;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - tw - 8));
  const top = Math.max(8, Math.min(y - 10, window.innerHeight - th - 8));
  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}
const hideTooltip = () => tooltip.classList.remove("show");
// Tap anywhere else dismisses the tooltip (mobile has no hover/leave)
document.addEventListener("click", hideTooltip);

function renderHeatmap() {
  const grid = document.getElementById("heatmap-grid");
  if (entries.length === 0) {
    grid.innerHTML =
      '<div class="hm-empty">No problems logged yet.<br>Add problems in the "Log problem" tab.</div>';
    return;
  }
  grid.innerHTML = "";
  [...entries]
    .sort((a, b) => calcRetention(a) - calcRetention(b))
    .forEach((e) => {
      const r = calcRetention(e);
      const cell = document.createElement("div");
      cell.className = "hm-cell";
      cell.style.background = rColor(r);
      const label =
        e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name;
      cell.innerHTML = `${isDue(e) ? '<div class="hm-due-dot"></div>' : ""}
<div class="cell-label">${esc(label)}</div>
<div class="cell-pct" style="color:${rTextColor(r)}">${Math.round(r * 100)}%</div>`;
      // Desktop: hover to show, follow the cursor, leave to hide
      cell.addEventListener("mouseenter", () => fillTooltip(e, r));
      cell.addEventListener("mousemove", (ev) =>
        placeTooltip(ev.clientX, ev.clientY),
      );
      cell.addEventListener("mouseleave", hideTooltip);
      // Touch/click: tap to show near the cell (no hover on mobile).
      // stopPropagation so the document handler doesn't instantly hide it.
      cell.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const rect = cell.getBoundingClientRect();
        fillTooltip(e, r);
        placeTooltip(rect.left + rect.width / 2, rect.bottom + 10);
      });
      grid.appendChild(cell);
    });
  if (!chartDrawn) {
    drawCurve();
    chartDrawn = true;
  }
  drawUserCurve();
}

// ── Due ───────────────────────────────────────────────────────────────
// One renderer for both states. When `locked`, the mark buttons are disabled
// — the problem is previewed with a countdown but can't be logged until it
// actually unlocks.
function dueCard(e, pill, locked) {
  const btn = (cls, felt, label) =>
    locked
      ? `<button class="mark-btn ${cls}" disabled>${label}</button>`
      : `<button class="mark-btn ${cls}" onclick="markReviewed('${e.firestoreId}','${felt}')">${label}</button>`;
  return `
    <div class="due-card${locked ? " is-locked" : ""}">
<div class="due-info">
  <div class="due-name">${esc(e.name)}${pill}</div>
  <div class="due-meta">${esc(patternLabel(e)) || "—"} · ${revLabel(e.reviews)} · ${esc(e.source)}</div>
  ${noteOf(e) ? `<div class="item-note">${esc(noteOf(e))}</div>` : ""}
</div>
<div class="mark-btns">
  ${btn("mark-easy", "easy", "Easy")}
  ${btn("mark-medium", "medium", "Medium")}
  ${btn("mark-hard", "hard", "Hard")}
</div>
    </div>`;
}

function renderDue() {
  const list = document.getElementById("due-list");
  const now = Date.now();
  // Most overdue first (smallest dueAt is furthest in the past).
  const due = entries.filter(isDue).sort((a, b) => dueAt(a) - dueAt(b));
  // Upcoming within the preview window — shown locked, with a countdown.
  const soon = entries
    .filter((e) => !isDue(e) && dueAt(e) - now <= SOON_WINDOW_MS)
    .sort((a, b) => dueAt(a) - dueAt(b));

  if (!due.length && !soon.length) {
    // Nothing now and nothing imminent — point at the next one coming up.
    const next = entries
      .filter((e) => !isDue(e))
      .sort((a, b) => dueAt(a) - dueAt(b))[0];
    list.innerHTML = `<div class="empty-state"><strong>All clear.</strong><p>${
      next
        ? `Next up: <strong>${esc(next.name)}</strong> — ${until(
            next.nextReview,
          ).toLowerCase()}.`
        : "Log a problem to get started."
    }</p></div>`;
    return;
  }

  let html = due
    .map((e) => {
      const od = Math.floor((now - dueAt(e)) / 86400000);
      const pill =
        od <= 0
          ? '<span class="due-pill due-today">Due today</span>'
          : `<span class="due-pill due-over">${od} day${od === 1 ? "" : "s"} overdue</span>`;
      return dueCard(e, pill, false);
    })
    .join("");

  if (soon.length) {
    html += due.length
      ? '<div class="due-subhead">Coming up</div>'
      : '<div class="due-note">Nothing due right now — coming up:</div>';
    html += soon
      .map((e) => {
        const pill = `<span class="due-pill due-soon">Due in ${fmtCountdown(
          dueAt(e) - now,
        )}</span>`;
        return dueCard(e, pill, true);
      })
      .join("");
  }
  list.innerHTML = html;
}

// While the Due tab is open, tick the countdowns and auto-unlock problems
// the moment they become due.
let dueTimer = null;
function startDueTimer() {
  stopDueTimer();
  dueTimer = setInterval(() => {
    if (document.querySelector(".panel.active")?.id === "panel-due")
      renderDue();
    else stopDueTimer();
  }, 30000);
}
function stopDueTimer() {
  if (dueTimer) {
    clearInterval(dueTimer);
    dueTimer = null;
  }
}

window.markReviewed = async (fid, felt) => {
  const e = entries.find((x) => x.firestoreId === fid);
  if (!e || !currentUid) return;
  // Snapshot the pre-review state so the action can be undone.
  const prev = {
    reviews: e.reviews,
    diff: e.diff,
    lastReviewAt: e.lastReviewAt,
    nextReview: e.nextReview,
  };
  const newReviews = nextStage(e.reviews, felt);
  const now = Date.now();
  const nextReview = now + STAGE_DAYS[newReviews] * 86400000;
  setSyncing(true);
  try {
    await updateDoc(doc(db, "users", currentUid, "problems", fid), {
      reviews: newReviews,
      diff: felt,
      lastReviewAt: now,
      nextReview,
    });
    showToast(
      `Marked ${felt} — next review ${until(nextReview).toLowerCase()}`,
      "Undo",
      async () => {
        try {
          await updateDoc(
            doc(db, "users", currentUid, "problems", fid),
            prev,
          );
          showToast("Review reverted");
          track("undo_review");
        } catch (err) {
          showToast("Undo failed: " + err.message);
        }
      },
    );
    track("review_problem", { felt, stage: newReviews });
  } catch (err) {
    showToast("Error: " + err.message);
    setSyncing(false);
  }
};

// ── All problems ──────────────────────────────────────────────────────
function renderAll() {
  const list = document.getElementById("all-list");
  if (!entries.length) {
    list.innerHTML =
      '<div class="empty-state"><strong>No problems yet.</strong><p>Log your first problem above.</p></div>';
    return;
  }
  list.innerHTML = entries
    .map((e) => {
      const r = calcRetention(e);
      return `
    <div class="prob-row">
<div class="prob-retention" style="background:${rColor(r)};color:${rTextColor(r)};border:1px solid ${rTextColor(r)}">
  ${Math.round(r * 100)}%
</div>
<div class="prob-info">
  <div class="prob-name">${esc(e.name)}</div>
  <div class="prob-meta">${esc(patternLabel(e)) || "No pattern"} · ${esc(e.source)} · Solved ${fmtDate(e.solvedAt)}</div>
  <div class="prob-next">Next review: ${until(e.nextReview)}</div>
  ${noteOf(e) ? `<div class="item-note">${esc(noteOf(e))}</div>` : ""}
</div>
<span class="tag tag-${e.diff}">${e.diff}</span>
<span class="rev-label">${revLabel(e.reviews)}</span>
<button class="icon-btn" onclick="openEdit('${e.firestoreId}')" title="Edit">&#x270E;</button>
<button class="del-btn" onclick="deleteProblem('${e.firestoreId}')" title="Delete">&#x2715;</button>
    </div>`;
    })
    .join("");
}

// ── Patterns ──────────────────────────────────────────────────────────
// Group problems by their structured category and render one collapsible
// section per pattern. Problems without a category (legacy/untagged) fall
// under "Uncategorized"; their old free-text pattern is shown so they're
// easy to re-tag via Edit.
function renderPatterns() {
  const container = document.getElementById("patterns-list");
  if (!entries.length) {
    container.innerHTML =
      '<div class="empty-state"><strong>No problems yet.</strong><p>Log a problem to see it categorized here.</p></div>';
    return;
  }

  const groups = new Map();
  for (const e of entries) {
    const key = e.category || UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  // Order groups by the canonical PATTERNS order, with Uncategorized last.
  const order = [...PATTERNS, UNCATEGORIZED];
  const rank = (k) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b));

  container.innerHTML = keys
    .map((key) => {
      const items = groups
        .get(key)
        .map((e) => {
          const bits = [];
          if (e.category === "DP" && e.subCategory)
            bits.push(esc(e.subCategory));
          else if (!e.category && e.pattern)
            bits.push(`<span class="pat-legacy">${esc(e.pattern)}</span>`);
          bits.push(esc(e.source));
          return `
        <div class="pat-item">
          <div class="pat-item-info">
            <div class="pat-item-name">${esc(e.name)}</div>
            <div class="pat-item-meta">${bits.join(" · ")}</div>
            ${noteOf(e) ? `<div class="item-note">${esc(noteOf(e))}</div>` : ""}
          </div>
          <span class="tag tag-${e.diff}">${e.diff}</span>
          <button class="icon-btn" onclick="openEdit('${e.firestoreId}')" title="Edit / re-tag">&#x270E;</button>
        </div>`;
        })
        .join("");
      return `
      <details class="pat-group" open>
        <summary class="pat-summary">
          <span class="pat-name">${esc(key)}</span>
          <span class="pat-count">${groups.get(key).length}</span>
        </summary>
        <div class="pat-items">${items}</div>
      </details>`;
    })
    .join("");
}

window.deleteProblem = async (fid) => {
  const e = entries.find((x) => x.firestoreId === fid);
  if (!e || !currentUid) return;
  // Keep a copy so the delete can be undone (re-added as a new doc).
  const { firestoreId, createdAt, ...data } = e;
  void firestoreId;
  void createdAt;
  setSyncing(true);
  try {
    await deleteDoc(doc(db, "users", currentUid, "problems", fid));
    showToast(`"${e.name}" removed`, "Undo", async () => {
      try {
        await addDoc(collection(db, "users", currentUid, "problems"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        showToast("Problem restored");
        track("undo_delete");
      } catch (err) {
        showToast("Undo failed: " + err.message);
      }
    });
    track("delete_problem");
  } catch (err) {
    showToast("Error: " + err.message);
    setSyncing(false);
  }
};

// ── Edit problem ──────────────────────────────────────────────────────
const toDateInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromDateInput = (val) => {
  const [y, m, dd] = val.split("-").map(Number);
  // Local noon avoids the date shifting a day across time zones.
  return new Date(y, m - 1, dd, 12, 0, 0, 0).getTime();
};
// Set a <select> to a value, inserting the option first if it isn't one
// of the presets (e.g. a custom source typed before this UI existed).
function setSelect(sel, val) {
  sel.value = val;
  if (sel.selectedIndex === -1 && val) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    sel.insertBefore(opt, sel.firstChild);
    sel.value = val;
  }
}

// Stage and next-review are system-calculated, so show them read-only and
// keep the preview live as the user changes "last reviewed at".
function updateSchedulePreview() {
  const e = entries.find(
    (x) => x.firestoreId === document.getElementById("edit-id").value,
  );
  if (!e) return;
  const lastVal = document.getElementById("edit-lastreview").value;
  const lastAt = lastVal ? fromDateInput(lastVal) : e.lastReviewAt;
  const next = lastAt + STAGE_DAYS[Math.min(e.reviews ?? 0, MAINT)] * 86400000;
  document.getElementById("edit-schedule").textContent =
    `${revLabel(e.reviews)} · next review ${until(next).toLowerCase()}`;
}

// Reflect the selected pattern in the edit modal: DP reveals the sub-type
// row, every other pattern hides it.
function syncEditSubtypeVisibility() {
  const isDP = document.getElementById("edit-pattern").value === "DP";
  document.getElementById("edit-subtype-wrap").style.display = isDP
    ? ""
    : "none";
  if (!isDP) document.getElementById("edit-subtype").selectedIndex = 0;
}

window.openEdit = (fid) => {
  const e = entries.find((x) => x.firestoreId === fid);
  if (!e) return;
  document.getElementById("edit-id").value = fid;
  document.getElementById("edit-name").value = e.name || "";
  document.getElementById("edit-pattern").value = PATTERNS.includes(e.category)
    ? e.category
    : "";
  syncEditSubtypeVisibility();
  document.getElementById("edit-subtype").value =
    e.category === "DP" && DP_SUBTYPES.includes(e.subCategory)
      ? e.subCategory
      : "";
  // Prefill the note. For a re-tagged problem this recovers the old free-text
  // `pattern` (see noteOf) so it's no longer hidden and is saved into `note`.
  document.getElementById("edit-note").value = noteOf(e);
  // Surface any legacy free-text next to the pattern picker so an untagged
  // problem is easy to re-tag.
  const legacy = document.getElementById("edit-legacy");
  if (!e.category && e.pattern) {
    legacy.textContent = `Previously: ${e.pattern}`;
    legacy.style.display = "";
  } else {
    legacy.style.display = "none";
  }
  setSelect(
    document.getElementById("edit-source"),
    e.source || "Leetcode",
  );
  document.getElementById("edit-diff").value = [
    "easy",
    "medium",
    "hard",
  ].includes(e.diff)
    ? e.diff
    : "medium";
  const lastInput = document.getElementById("edit-lastreview");
  lastInput.value = toDateInput(e.lastReviewAt);
  lastInput.max = toDateInput(Date.now()); // can't have reviewed it in the future
  updateSchedulePreview();
  document.getElementById("edit-overlay").classList.add("show");
};

window.closeEdit = () =>
  document.getElementById("edit-overlay").classList.remove("show");

window.saveEdit = async () => {
  const fid = document.getElementById("edit-id").value;
  const e = entries.find((x) => x.firestoreId === fid);
  if (!e || !currentUid) return;
  const name = document.getElementById("edit-name").value.trim();
  if (!name) {
    showToast("Name can't be empty");
    return;
  }
  const category = document.getElementById("edit-pattern").value;
  if (category === "DP" && !document.getElementById("edit-subtype").value) {
    showToast("Pick a DP type");
    return;
  }
  const update = {
    name,
    category,
    subCategory:
      category === "DP"
        ? document.getElementById("edit-subtype").value
        : "",
    note: document.getElementById("edit-note").value.trim(),
    source: document.getElementById("edit-source").value,
    diff: document.getElementById("edit-diff").value,
  };
  const lastVal = document.getElementById("edit-lastreview").value;
  // "Last reviewed at" is the only user-owned date; the stage and the next
  // review stay system-calculated, so derive nextReview from this date.
  if (lastVal && lastVal !== toDateInput(e.lastReviewAt)) {
    const lastReviewAt = fromDateInput(lastVal);
    update.lastReviewAt = lastReviewAt;
    update.nextReview =
      lastReviewAt + STAGE_DAYS[Math.min(e.reviews ?? 0, MAINT)] * 86400000;
  }
  setSyncing(true);
  try {
    await updateDoc(
      doc(db, "users", currentUid, "problems", fid),
      update,
    );
    window.closeEdit();
    showToast("Changes saved");
    track("edit_problem");
  } catch (err) {
    showToast("Error: " + err.message);
    setSyncing(false);
  }
};

// Close the edit modal on backdrop click or Escape.
document.getElementById("edit-overlay").addEventListener("click", (ev) => {
  if (ev.target.id === "edit-overlay") window.closeEdit();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") window.closeEdit();
});
document
  .getElementById("edit-lastreview")
  .addEventListener("input", updateSchedulePreview);
document
  .getElementById("edit-pattern")
  .addEventListener("change", syncEditSubtypeVisibility);

// ── Charts ────────────────────────────────────────────────────────────
// Load Chart.js once and reuse. Must be the ESM build (/+esm): the UMD
// bundle has no ES named exports, so importing it leaves Chart undefined.
let ChartLib = null;
async function getChart() {
  if (!ChartLib) {
    const { Chart, registerables } = await import(
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm"
    );
    Chart.register(...registerables);
    ChartLib = Chart;
  }
  return ChartLib;
}

// Forgetting curve — static reference diagram (not tied to your data).
async function drawCurve() {
  const canvas = document.getElementById("fc-canvas");
  if (!canvas) return;
  const Chart = await getChart();
  const days = Array.from({ length: 31 }, (_, i) => i);
  function forget(t, n) {
    const stabs = [1, 3, 7, 21];
    let r = 1;
    for (let i = 0; i < n; i++) {
      const s = stabs[i] || 21;
      if (t > s) r *= Math.exp((-0.693 * (t - s)) / s);
    }
    return Math.max(0, Math.min(1, r));
  }
  new Chart(canvas, {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: "No revision",
          data: days.map((d) => Math.round(Math.exp(-0.693 * d) * 100)),
          borderColor: "#E85D5D",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
          borderDash: [5, 3],
        },
        {
          label: "After R1 (day 1)",
          data: days.map((d) => Math.round(forget(d, 1) * 100)),
          borderColor: "#F5A623",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
        },
        {
          label: "After R4 (day 21)",
          data: days.map((d) => Math.round(forget(d, 4) * 100)),
          borderColor: "#2ECC8A",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#8B8FA8",
            font: { size: 11 },
            boxWidth: 14,
            padding: 16,
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (c) => " " + c.dataset.label + ": " + c.parsed.y + "%",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            maxTicksLimit: 8,
            callback: (v, i) => (i % 5 === 0 ? "Day " + i : ""),
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          title: {
            display: true,
            text: "Days since solving",
            color: "#555870",
            font: { size: 11 },
          },
        },
        y: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            callback: (v) => v + "%",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Retention",
            color: "#555870",
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// Your problems — retention forecast. One line per logged problem, using
// the same decay as calcRetention(), projected forward from today. Redrawn
// whenever the data changes, so it always reflects what you've logged.
let userChart = null;
async function drawUserCurve() {
  const canvas = document.getElementById("uc-canvas");
  if (!canvas) return;
  const Chart = await getChart();
  if (userChart) {
    userChart.destroy();
    userChart = null;
  }
  if (entries.length === 0) return;
  const horizon = 30;
  const days = Array.from({ length: horizon + 1 }, (_, i) => i);
  const palette = [
    "#5B8DEF", "#2ECC8A", "#F5A623", "#E85D5D",
    "#A06BE0", "#22B8CF", "#E879B9", "#9BB13A",
  ];
  const datasets = [...entries]
    .sort((a, b) => calcRetention(b) - calcRetention(a))
    .map((e, i) => {
      const stability = STAGE_DAYS[Math.min(e.reviews, MAINT)];
      const daysSince = (Date.now() - e.lastReviewAt) / 86400000;
      const color = palette[i % palette.length];
      return {
        label: e.name.length > 18 ? e.name.slice(0, 17) + "…" : e.name,
        data: days.map((d) =>
          Math.round(
            Math.exp((-0.693 * (daysSince + d)) / stability) * 100,
          ),
        ),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 1.75,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
      };
    });
  userChart = new Chart(canvas, {
    type: "line",
    data: { labels: days, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#8B8FA8",
            font: { size: 11 },
            boxWidth: 14,
            padding: 12,
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            title: (items) =>
              items[0].label === "0"
                ? "Today"
                : "In " + items[0].label + " days",
            label: (c) => " " + c.dataset.label + ": " + c.parsed.y + "%",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            maxTicksLimit: 8,
            callback: (v, i) =>
              i === 0 ? "Today" : i % 5 === 0 ? "+" + i + "d" : "",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          title: {
            display: true,
            text: "Days from today",
            color: "#555870",
            font: { size: 11 },
          },
        },
        y: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            callback: (v) => v + "%",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Predicted retention",
            color: "#555870",
            font: { size: 11 },
          },
        },
      },
    },
  });
}
