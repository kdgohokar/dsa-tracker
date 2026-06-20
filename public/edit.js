// ── Edit problem modal ────────────────────────────────────────────────
import { state } from "./state.js";
import { fillSelect } from "./dom.js";
import {
  PATTERNS,
  DP_SUBTYPES,
  UNCATEGORIZED,
  STAGE_DAYS,
  MAINT,
  noteOf,
  revLabel,
  until,
  toDateInput,
  fromDateInput,
} from "./model.js";
import { db, doc, updateDoc, track } from "./firebase.js";
import { showToast, setSyncing } from "./ui.js";

// The edit form lets a problem stay Uncategorized (selectable blank) so
// legacy ones aren't forced into a category.
fillSelect("edit-pattern", PATTERNS, UNCATEGORIZED, false);
fillSelect("edit-subtype", DP_SUBTYPES, "Select…", true);

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
  const e = state.entries.find(
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
  const e = state.entries.find((x) => x.firestoreId === fid);
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
  setSelect(document.getElementById("edit-source"), e.source || "Leetcode");
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
  const e = state.entries.find((x) => x.firestoreId === fid);
  if (!e || !state.currentUid) return;
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
      category === "DP" ? document.getElementById("edit-subtype").value : "",
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
    await updateDoc(doc(db, "users", state.currentUid, "problems", fid), update);
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
