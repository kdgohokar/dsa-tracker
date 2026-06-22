// ── Problem lists: "All problems" + "Patterns" tabs ───────────────────
import { state } from "./state.js";
import { html, raw, renderTo } from "./dom.js";
import {
  PATTERNS,
  UNCATEGORIZED,
  calcRetention,
  rColor,
  rTextColor,
  patternLabel,
  noteOf,
  fmtDate,
  until,
  revLabel,
} from "./model.js";
import {
  db,
  doc,
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp,
  track,
} from "./firebase.js";
import { showToast, setSyncing } from "./ui.js";

export function renderAll() {
  const list = document.getElementById("all-list");

  const countEl = document.getElementById("listCount");
  if (countEl) {
    const n = state.entries.length;
    countEl.textContent = n ? ` (${n})` : "";
  }

  if (!state.entries.length) {
    list.innerHTML =
      '<div class="empty-state"><strong>No problems yet.</strong><p>Log your first problem above.</p></div>';
    return;
  }
  renderTo(
    list,
    html`${state.entries.map((e) => {
      const r = calcRetention(e);
      return html` <div class="prob-row">
        <div
          class="prob-retention"
          style="background:${rColor(r)};color:${rTextColor(
            r,
          )};border:1px solid ${rTextColor(r)}"
        >
          ${Math.round(r * 100)}%
        </div>
        <div class="prob-info">
          <div class="prob-name">${e.name}</div>
          <div class="prob-meta">
            ${patternLabel(e) || "No pattern"} · ${e.source} · Solved
            ${fmtDate(e.solvedAt)}
          </div>
          <div class="prob-next">Next review: ${until(e.nextReview)}</div>
          ${noteOf(e) ? html`<div class="item-note">${noteOf(e)}</div>` : ""}
        </div>
        <span class="tag tag-${e.diff}">${e.diff}</span>
        <span class="rev-label">${revLabel(e.reviews)}</span>
        <button
          class="icon-btn"
          onclick="openEdit('${e.firestoreId}')"
          title="Edit"
        >
          &#x270E;
        </button>
        <button
          class="del-btn"
          onclick="deleteProblem('${e.firestoreId}')"
          title="Delete"
        >
          &#x2715;
        </button>
      </div>`;
    })}`,
  );
}

// ── Patterns ──────────────────────────────────────────────────────────
// Group problems by their structured category and render one collapsible
// section per pattern. Problems without a category (legacy/untagged) fall
// under "Uncategorized"; their old free-text pattern is shown so they're
// easy to re-tag via Edit.
export function renderPatterns() {
  const container = document.getElementById("patterns-list");
  if (!state.entries.length) {
    container.innerHTML =
      '<div class="empty-state"><strong>No problems yet.</strong><p>Log a problem to see it categorized here.</p></div>';
    return;
  }

  const groups = new Map();
  for (const e of state.entries) {
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

  renderTo(
    container,
    html`${keys.map((key) => {
      const items = groups.get(key).map((e) => {
        // Meta is a " · "-joined mix of escaped text and (for legacy items)
        // an italic span; build it as fragments so each escapes correctly.
        const bits = [];
        if (e.category === "DP" && e.subCategory) bits.push(e.subCategory);
        else if (!e.category && e.pattern)
          bits.push(html`<span class="pat-legacy">${e.pattern}</span>`);
        bits.push(e.source);
        const meta = bits.map((b, i) => html`${i ? raw(" · ") : ""}${b}`);
        return html` <div class="pat-item">
          <div class="pat-item-info">
            <div class="pat-item-name">${e.name}</div>
            <div class="pat-item-meta">${meta}</div>
            ${noteOf(e) ? html`<div class="item-note">${noteOf(e)}</div>` : ""}
          </div>
          <span class="tag tag-${e.diff}">${e.diff}</span>
          <button
            class="icon-btn"
            onclick="openEdit('${e.firestoreId}')"
            title="Edit / re-tag"
          >
            &#x270E;
          </button>
        </div>`;
      });
      return html` <details class="pat-group" open>
        <summary class="pat-summary">
          <span class="pat-name">${key}</span>
          <span class="pat-count">${groups.get(key).length}</span>
        </summary>
        <div class="pat-items">${items}</div>
      </details>`;
    })}`,
  );
}

window.deleteProblem = async (fid) => {
  const e = state.entries.find((x) => x.firestoreId === fid);
  if (!e || !state.currentUid) return;
  // Keep a copy so the delete can be undone (re-added as a new doc).
  const { firestoreId, createdAt, ...data } = e;
  void firestoreId;
  void createdAt;
  setSyncing(true);
  try {
    await deleteDoc(doc(db, "users", state.currentUid, "problems", fid));
    showToast(`"${e.name}" removed`, "Undo", async () => {
      try {
        await addDoc(collection(db, "users", state.currentUid, "problems"), {
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
