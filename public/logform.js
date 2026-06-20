// ── Log problem form ──────────────────────────────────────────────────
import { state } from "./state.js";
import { fillSelect } from "./dom.js";
import { PATTERNS, DP_SUBTYPES, STAGE_DAYS, until } from "./model.js";
import { db, collection, addDoc, serverTimestamp, track } from "./firebase.js";
import { showToast, setSyncing } from "./ui.js";

// The Log form requires a pattern (disabled placeholder forces a real choice).
fillSelect("f-pattern", PATTERNS, "Select pattern…", true);
fillSelect("f-subtype", DP_SUBTYPES, "Select…", true);

// Submit is enabled only with a name, a difficulty, a pattern, and — when
// the pattern is DP — a sub-type.
function updateLogValidity() {
  const name = document.getElementById("f-name").value.trim();
  const pattern = document.getElementById("f-pattern").value;
  const sub = document.getElementById("f-subtype").value;
  const ok =
    !!name && !!state.selectedDiff && !!pattern && (pattern !== "DP" || !!sub);
  document.getElementById("submit-btn").disabled = !ok;
}

// Show the DP sub-type field only when DP is the chosen pattern.
function syncSubtypeVisibility() {
  const isDP = document.getElementById("f-pattern").value === "DP";
  document.getElementById("f-subtype-wrap").style.display = isDP ? "" : "none";
  if (!isDP) document.getElementById("f-subtype").selectedIndex = 0;
}

window.selectDiff = (d) => {
  state.selectedDiff = d;
  ["easy", "medium", "hard"].forEach((x) => {
    document.getElementById("db-" + x).className =
      "diff-btn" + (d === x ? " sel-" + x : "");
  });
  updateLogValidity();
};

document.getElementById("f-name").addEventListener("input", updateLogValidity);
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
  if (!name || !state.selectedDiff || !category || !state.currentUid) return;
  if (category === "DP" && !subCategory) return;

  const diff = state.selectedDiff;
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
      collection(db, "users", state.currentUid, "problems"),
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
    state.selectedDiff = null;
    ["easy", "medium", "hard"].forEach(
      (x) => (document.getElementById("db-" + x).className = "diff-btn"),
    );
    document.getElementById("submit-btn").disabled = true;
  } catch (e) {
    showToast("Error saving: " + e.message);
    setSyncing(false);
  }
};
