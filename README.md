# DSA Revision Tracker — Firebase Edition

Spaced repetition tracker for DSA interview prep.
**Real-time sync across MacBook, iPhone, any browser** via Firebase Firestore + Google Auth.

---

## Setup (one time, ~30 minutes)

### Step 1 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `dsa-tracker` → Continue
3. Disable Google Analytics (not needed) → **Create project**

---

### Step 2 — Enable Google Sign-in

1. In Firebase Console → **Authentication** → **Get started**
2. **Sign-in method** tab → **Google** → Enable → set your email as support email → **Save**

---

### Step 3 — Create Firestore database

1. Firebase Console → **Firestore Database** → **Create database**
2. Choose **Start in production mode** → select a region close to you (e.g. `asia-south1` for India) → **Enable**
3. Go to **Rules** tab → replace the entire content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/problems/{problemId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Click **Publish**

---

### Step 4 — Register a web app and get your config

1. Firebase Console → **Project Settings** (gear icon) → **Your apps** → click `</>` (Web)
2. Register app — name it `dsa-tracker-web` — **do not** enable Firebase Hosting here
3. You'll see a config block like this:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "dsa-tracker-xxxxx.firebaseapp.com",
  projectId:         "dsa-tracker-xxxxx",
  storageBucket:     "dsa-tracker-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef"
};
```

4. Open `public/app.js` in your editor
5. Find the block near the top that starts with `// STEP 1: Replace this config`
6. Replace the placeholder values with your real config values

---

### Step 5 — Add your domain to Firebase Auth

After deploying (Step 7), you need to whitelist your domain so Google Sign-in works:

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Add `<your-project-id>.web.app` (Firebase Hosting domain) — it's usually already there
3. If you use a custom domain, add that too

---

### Step 6 — Install Firebase CLI and log in

```bash
npm install -g firebase-tools
firebase login
```

---

### Step 7 — Deploy

```bash
# In the project root (where firebase.json lives)
firebase deploy
```

Your app is live at:
```
https://<your-project-id>.web.app
```

Open it on your MacBook and iPhone — both will sync in real time.

---

## Auto-deploy via GitHub Actions (optional)

Every push to `main` auto-deploys to Firebase Hosting.

### Setup

1. Push this repo to GitHub
2. Run locally to generate a service account token:
   ```bash
   firebase init hosting:github
   ```
   This walks you through connecting GitHub — it adds the `FIREBASE_SERVICE_ACCOUNT` secret automatically.

3. Add your Project ID as a secret:
   - GitHub → repo → **Settings → Secrets → Actions → New repository secret**
   - Name: `FIREBASE_PROJECT_ID`
   - Value: your Firebase project ID (e.g. `dsa-tracker-xxxxx`)

Now every `git push origin main` auto-deploys.

---

## Project structure

```
dsa-tracker/
├── public/
│   ├── index.html          # Markup
│   ├── styles.css          # All styles
│   └── app.js              # App logic + Firebase config (no build step)
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions auto-deploy
├── firebase.json            # Firebase Hosting config
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore query indexes
└── README.md
```

---

## Data model

Firestore path: `users/{uid}/problems/{problemId}`

Each document:
```json
{
  "name":         "Coin Change",
  "category":     "DP",
  "subCategory":  "1D",
  "source":       "Striver DP",
  "diff":         "medium",
  "reviews":      2,
  "solvedAt":     1718000000000,
  "lastReviewAt": 1718200000000,
  "nextReview":   1718800000000,
  "createdAt":    "<server timestamp>"
}
```

`category` is one of the fixed DSA patterns (DP, Greedy, 2 Pointers, …); `subCategory`
holds the DP dimension (`1D` / `2D` / `3D`) and is empty for every other pattern.
Problems logged before this field existed carry a legacy free-text `pattern` string
instead — they show as **Uncategorized** in the Patterns tab until re-tagged via Edit.

---

## Customising SRS intervals

Edit this block near the top of `public/app.js`:

```js
const INTERVALS = {
  easy:   [1, 7, 21, 60],   // days for R1, R2, R3, R4
  medium: [1, 3, 14, 42],
  hard:   [1, 2,  7, 21]
};
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google Sign-in popup blocked | Allow popups for the domain in your browser |
| "Permission denied" from Firestore | Check Firestore Rules are published (Step 3) |
| Changes not appearing on iPhone | Pull-to-refresh — Firestore offline cache may be stale |
| `auth/unauthorized-domain` error | Add your domain to Firebase Auth → Authorized domains (Step 5) |
