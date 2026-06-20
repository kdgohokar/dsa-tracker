// ── Firebase init & services ──────────────────────────────────────────
// The single place Firebase is configured and initialized. Other modules
// import the live `auth`/`db` handles, the guarded `track()` helper, and the
// Firestore functions re-exported below (so the SDK URL appears only here).
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
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAnalytics,
  logEvent,
  isSupported as analyticsSupported,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { state } from "./state.js";
import { showToast } from "./ui.js";

// Re-export the Firestore data functions so feature modules import them from
// here rather than re-listing the gstatic URL in every file.
export {
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
export { onAuthStateChanged };

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
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
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

export const auth = getAuth(app);
// Offline persistence with multi-tab sync
// (replaces the deprecated, single-tab enableIndexedDbPersistence)
export const db = initializeFirestore(app, {
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
export function track(name, params) {
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
  if (state.unsubscribe) state.unsubscribe();
  await fbSignOut(auth);
};
