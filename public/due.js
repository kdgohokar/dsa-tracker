// ── Due (review queue) ────────────────────────────────────────────────
import { state } from "./state.js";
import { html, renderTo } from "./dom.js";
import {
  isDue,
  dueAt,
  SOON_WINDOW_MS,
  STAGE_DAYS,
  nextStage,
  until,
  fmtCountdown,
  revLabel,
  patternLabel,
  noteOf,
} from "./model.js";
import { db, doc, updateDoc, track } from "./firebase.js";
import { showToast, setSyncing } from "./ui.js";

// One renderer for both states. When `locked`, the mark buttons are disabled
// — the problem is previewed with a countdown but can't be logged until it
// actually unlocks.
function dueCard(e, pill, locked) {
  const btn = (cls, felt, label) =>
    locked
      ? html`<button class="mark-btn ${cls}" disabled>${label}</button>`
      : html`<button
          class="mark-btn ${cls}"
          onclick="markReviewed('${e.firestoreId}','${felt}')"
        >
          ${label}
        </button>`;
  return html`
    <div class="due-card${locked ? " is-locked" : ""}">
      <div class="due-info">
        <div class="due-name">${e.name}${pill}</div>
        <div class="due-meta">
          ${patternLabel(e) || "—"} · ${revLabel(e.reviews)} · ${e.source}
        </div>
        ${noteOf(e) ? html`<div class="item-note">${noteOf(e)}</div>` : ""}
      </div>
      <div class="mark-btns">
        ${btn("mark-easy", "easy", "Easy")} ${btn("mark-medium", "medium", "Medium")}
        ${btn("mark-hard", "hard", "Hard")}
      </div>
    </div>`;
}

export function renderDue() {
  const list = document.getElementById("due-list");
  const now = Date.now();
  // Most overdue first (smallest dueAt is furthest in the past).
  const due = state.entries.filter(isDue).sort((a, b) => dueAt(a) - dueAt(b));
  // Upcoming within the preview window — shown locked, with a countdown.
  const soon = state.entries
    .filter((e) => !isDue(e) && dueAt(e) - now <= SOON_WINDOW_MS)
    .sort((a, b) => dueAt(a) - dueAt(b));

  if (!due.length && !soon.length) {
    // Nothing now and nothing imminent — point at the next one coming up.
    const next = state.entries
      .filter((e) => !isDue(e))
      .sort((a, b) => dueAt(a) - dueAt(b))[0];
    renderTo(
      list,
      html`<div class="empty-state">
        <strong>All clear.</strong>
        <p>
          ${next
            ? html`Next up: <strong>${next.name}</strong> —
                ${until(next.nextReview).toLowerCase()}.`
            : "Log a problem to get started."}
        </p>
      </div>`,
    );
    return;
  }

  const dueCards = due.map((e) => {
    const od = Math.floor((now - dueAt(e)) / 86400000);
    const pill =
      od <= 0
        ? html`<span class="due-pill due-today">Due today</span>`
        : html`<span class="due-pill due-over"
            >${od} day${od === 1 ? "" : "s"} overdue</span
          >`;
    return dueCard(e, pill, false);
  });

  const soonSection = soon.length
    ? html`${due.length
          ? html`<div class="due-subhead">Coming up</div>`
          : html`<div class="due-note">Nothing due right now — coming up:</div>`}${soon.map(
          (e) => {
            const pill = html`<span class="due-pill due-soon"
              >Due in ${fmtCountdown(dueAt(e) - now)}</span
            >`;
            return dueCard(e, pill, true);
          },
        )}`
    : "";

  renderTo(list, html`${dueCards}${soonSection}`);
}

// While the Due tab is open, tick the countdowns and auto-unlock problems
// the moment they become due.
let dueTimer = null;
export function startDueTimer() {
  stopDueTimer();
  dueTimer = setInterval(() => {
    if (document.querySelector(".panel.active")?.id === "panel-due")
      renderDue();
    else stopDueTimer();
  }, 30000);
}
export function stopDueTimer() {
  if (dueTimer) {
    clearInterval(dueTimer);
    dueTimer = null;
  }
}

window.markReviewed = async (fid, felt) => {
  const e = state.entries.find((x) => x.firestoreId === fid);
  if (!e || !state.currentUid) return;
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
    await updateDoc(doc(db, "users", state.currentUid, "problems", fid), {
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
            doc(db, "users", state.currentUid, "problems", fid),
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
