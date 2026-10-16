# SERP POS Installation Tracker

Implements `SRS – SERP POS Installation Tracker`.

| Folder | What |
|---|---|
| `backoffice/` | Next.js 15 (App Router, TS) back office for Supervisors/Admins |
| `mobile/` | Flutter app (Android, iOS, **and web**) for Technical Officers/Supervisors |
| `firebase/` | Firestore + Storage rules, Cloud Functions (TS), seed script, emulator image |

## Run everything locally (Docker + Firebase emulators)
```
docker compose up --build
```
- Back office: http://localhost:3000 — mobile web: http://localhost:8081 — Emulator UI: http://localhost:4000
- Seeded Admin: `admin` / `ChangeMe123` (override with `ADMIN_USERNAME`/`ADMIN_PASSWORD`). Create users in **Users**; the checklist is seeded as template v1.
- Emulator data is not persisted between restarts (the seed re-runs on start).
- The Admin has `mustChangePassword`, so log in once via the mobile app to set a new password (back office has no change-password screen).

## Real Firebase project
1. Create a project; enable Auth (Email/Password), Firestore, Storage, Functions (Blaze plan).
2. `cd firebase && firebase deploy --project <id>` (rules, indexes, functions).
3. Seed template + first admin: `cd firebase/seed && npm i && GOOGLE_APPLICATION_CREDENTIALS=key.json GCLOUD_PROJECT=<id> node seed.mjs`.
4. `cp .env.example .env`, fill the web-app config, then
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up --build -d backoffice mobile-web`.

Firebase web config is baked in at build time (`NEXT_PUBLIC_*` / `--dart-define`).

## Native mobile builds
`cd mobile && flutter run --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=... --dart-define=FIREBASE_PROJECT_ID=...` (add the other defines from `lib/firebase_options.dart`). For store builds, run `flutterfire configure` or add `google-services.json` / `GoogleService-Info.plist`.

## Known gaps vs the SRS
- Records table filters/sort run client-side over the latest 1000 records (move to server queries for 50k scale).
- Excel export is CSV; PDF is browser print (no SERP logo layout yet).
- Builder uses HTML5 drag-and-drop + up/down buttons; undo covers the last 20 actions.
- AUTH-04 lockout relies on Firebase's built-in throttling; AUTH-07 biometrics, push (FCM token registration), App Check, Crashlytics, minAppVersion screen and nightly backup export are not implemented.
- Offline photo/signature uploads need a connection (text answers sync offline).
- Not tested: Docker image builds, Firebase emulator run, on-device Android/iOS.
