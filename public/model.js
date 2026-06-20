// ── Model & pure helpers ──────────────────────────────────────────────
// Everything in here is pure logic: no DOM, no Firebase, no module-load side
// effects. That keeps it unit-testable in plain Node (see test/smoke.test.mjs)
// and free of import cycles — every other module can safely depend on it.

// ── SRS config ───────────────────────────────────────────────────────
// Fixed review schedule (days), matching the SRS guide stages:
//   0=R1 (+1d), 1=R2 (+3d), 2=R3 (+7d), 3=R4 (+21d), 4=Maint (monthly)
export const STAGE_DAYS = [1, 3, 7, 21, 30];
export const MAINT = STAGE_DAYS.length - 1;

// Given the current stage and how the review felt, return the next stage.
// "Easy"/"Medium" promote one stage; "Hard" demotes per the guide's
// "if hard" column: R1→R1, R2→R1, R3→R2, R4→Maint, Maint→R3.
export function nextStage(stage, felt) {
  if (felt === "hard") return [0, 0, 1, MAINT, 2][stage];
  return Math.min(stage + 1, MAINT);
}

// ── Pattern taxonomy ──────────────────────────────────────────────────
// Fixed list of DSA patterns offered in the Log/Edit selectors and used to
// group the Patterns tab. DP is the only pattern with sub-types (1D/2D/3D).
export const PATTERNS = [
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
export const DP_SUBTYPES = ["1D", "2D", "3D"];
export const UNCATEGORIZED = "Uncategorized";

// Display label for a problem's pattern. The structured category wins; DP
// shows its sub-type (e.g. "DP · 2D"). Falls back to the legacy free-text
// `pattern` value (pre-feature problems), then to "".
export function patternLabel(e) {
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
export function noteOf(e) {
  if (e.note) return e.note;
  if (e.category && e.pattern) return e.pattern;
  return "";
}

// ── Retention model ───────────────────────────────────────────────────
export function calcRetention(e) {
  const daysSince = (Date.now() - e.lastReviewAt) / 86400000;
  const stability = STAGE_DAYS[Math.min(e.reviews, MAINT)];
  return Math.max(
    0,
    Math.min(1, Math.exp((-0.693 * daysSince) / stability)),
  );
}
export function rColor(r) {
  if (r > 0.75) return `rgba(46,204,138,${0.15 + r * 0.5})`;
  if (r > 0.4) return `rgba(245,166,35,${0.15 + r * 0.5})`;
  return `rgba(232,93,93,${0.2 + (1 - r) * 0.4})`;
}
export function rTextColor(r) {
  if (r > 0.75) return "rgba(46,204,138,0.85)";
  if (r > 0.4) return "rgba(245,166,35,0.85)";
  return "rgba(232,93,93,0.85)";
}

// ── Date / format helpers ─────────────────────────────────────────────
export const until = (ts) => {
  const d = Math.round((ts - Date.now()) / 86400000);
  if (d < 0)
    return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
};
export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
export const revLabel = (n) =>
  ["R1", "R2", "R3", "R4", "Maint."][Math.min(n, 4)];

// A problem becomes due on its scheduled calendar day — review it anytime
// that day, not at the exact timestamp it was logged. The 12h floor since the
// last review stops two reviews collapsing into one session, which would
// defeat the spacing. (Every interval is >= 1 day, so this never blocks an
// on-time review; it only blocks same-day cramming on the 1-day step.)
export const MIN_GAP_MS = 12 * 3600000;
// How far ahead the Due tab previews upcoming problems (shown locked).
export const SOON_WINDOW_MS = 12 * 3600000;
export const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// The exact moment a problem unlocks for review: the later of its scheduled
// calendar day and the 12h floor since the last review.
export const dueAt = (e) =>
  Math.max(startOfDay(e.nextReview), e.lastReviewAt + MIN_GAP_MS);
export const isDue = (e) => Date.now() >= dueAt(e);
// Human countdown until `ms` from now elapses: "HH:MM hours" while an hour or
// more remains, otherwise "M minutes".
export const fmtCountdown = (ms) => {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins >= 60) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m} hours`;
  }
  if (mins === 0) return "<1 minute";
  return `${mins} minute${mins === 1 ? "" : "s"}`;
};

export const toDateInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromDateInput = (val) => {
  const [y, m, dd] = val.split("-").map(Number);
  // Local noon avoids the date shifting a day across time zones.
  return new Date(y, m - 1, dd, 12, 0, 0, 0).getTime();
};
