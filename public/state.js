// ── Shared mutable state ──────────────────────────────────────────────
// ES module imports are read-only live bindings, so a module can't reassign
// a value it imported from another. The few pieces of cross-module mutable
// state therefore live on this single object: modules import `state` and
// read/write its properties (e.g. `state.entries = …`), which every importer
// sees immediately.
export const state = {
  entries: [], // all problems for the signed-in user (Firestore mirror)
  selectedDiff: null, // difficulty picked in the Log form, pre-submit
  currentUid: null, // signed-in user's uid, or null when signed out
  unsubscribe: null, // teardown for the Firestore onSnapshot listener
  landed: false, // have we picked the initial tab this session?
  chartDrawn: false, // has the static forgetting curve been drawn once?
};
