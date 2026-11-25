# Mäka mobile app (Expo · React Native · TypeScript)

The native iOS/Android app for Mäka. It uses the same API as the web client in `../web` and has the same screens and policies.

## Run it

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_URL=https://your-staging-server npx expo start
```

The app uses native modules (`expo-video`, `expo-secure-store` and others), so run it in a **development build** rather than Expo Go: `npx expo run:android` or `npx expo run:ios`. On Android, release builds only allow HTTPS servers.

- `EXPO_PUBLIC_API_URL` sets the server at build time. Without it, the Android emulator uses `http://10.0.2.2:8080`.
- Test builds can change the server on the welcome screen under **Server settings (test builds)**.

## Screens (`src/app/`, Expo Router)

| Area | Route | Notes |
|---|---|---|
| Welcome, sign-up, sign-in | `(auth)/` | Uses the approved logo, unchanged (`assets/brand/approved-logo.webp`). Shows the invite-code field when the server asks for one. |
| 19+ age gate | `(age)/verify`, `(age)/age-test/[checkId]` | The person picks **one** method. `src/core/gate.ts` keeps unverified accounts out of every community screen, and the server enforces the same rule. The simulator screen only works while the server runs the TEST provider. |
| Feed | `(app)/(tabs)/index` | Full-screen vertical paging with `expo-video`. Autoplays while visible, tap pauses, double-tap likes, mute toggle. Has For You / Following, infinite scroll, pull to refresh, and counts a view after 2 s. Only the visible item and its neighbours hold a player. |
| Comments, report, block, mute | `components/post.tsx` | Report reasons come from the server, including "stitch/remix made to ridicule someone". Report-and-block is one step. Held comments are labelled. |
| Single post, profiles | `(app)/p/[id]`, `(app)/u/[handle]`, `(app)/profile` | Follower counts are public, with the note that they never decide ranking, collaborations or earnings. Profile editing includes the photo. |
| Create | `(app)/(tabs)/create` | Camera or library (`expo-image-picker`), optional WebVTT captions, remix permission, rights confirmation. Uploads are **resumable**: chunked, they retry from the server offset after a dropped connection, and the progress is saved so they continue after the app restarts. |
| Inbox and threads | `(app)/inbox/` | Realtime messages over Server-Sent Events (an XHR-based client, `src/lib/realtime.ts`) with backoff reconnect. On reconnect or network return the thread fetches only the messages it missed (`?since=`). |
| Cinema | `(app)/(tabs)/cinema` | Plays only when the server returns a licensed stream for the viewer's territory. Placeholder titles show a disabled button and the server's explanation. |
| Collabs, Market, Studio | `(tabs)/collabs`, `(tabs)/market`, `market/[id]`, `studio` | No follower criteria anywhere. Checkout reports that payments are not connected. Studio shows real numbers only ($0 until there is real revenue). |
| Settings & safety | `(app)/settings` | DM policy, default remix permission, comment keyword filter, blocked and muted lists, reports, sanctions and appeals, orders, data export (share sheet), privacy policy, sign out, account deletion. |
| Admin | `(app)/admin` | Report queue (actions require a note), appeals (a different reviewer must decide), business verification, audit log. Visible only to verified admins. |

Accessibility: every control has an accessibility role and label (the tests drive the UI through them). Selected and disabled states are exposed, toasts are announced, and touch targets are at least 44 px. Offline: a banner appears while there is no connection, screens refetch when it returns, and realtime reconnects.

## Tests

```bash
npm run lint && npm run typecheck
npm test            # core logic + integration against the real API (needs DATABASE_URL, ffmpeg)
npm run test:web    # exports the app for web and drives 17 flows in a phone-sized browser
```

`src/core/` is platform-agnostic: the API client, resumable uploader, SSE parser and the 19+ gate. The integration tests run it against the real server, including uploads that survive dropped connections and an app restart.

The web smoke test covers the real React Native screens rendered with react-native-web. It does **not** cover native-only behaviour: camera capture, the native video decoder, SecureStore, the share sheet and native gestures. Those need a check on a device or emulator, using the APK from the Android build workflow.

## Builds (Task 4)

- **App identity** (`app.json`): name **Mäka**. Bundle ID and package `io.github.bliuew.maka`, which is reverse-DNS of `bliuew.github.io`. Change it to a domain you own **before the first store upload**, because it can't change afterwards.
- **Icons**: the founder's honeycomb "M" design (`web/assets/app-icon-design.webp`). `scripts/make_app_icons.py` builds the iOS/store icon, the Android adaptive icon (fitted to the launcher safe zone), the splash (the rounded cream tile on midnight charcoal) and the web icons. It only resizes the design, never redraws it.
- **Permissions**: camera, microphone (sound for recorded videos), photo access and internet. Location, contacts, overlay and legacy storage-write permissions are explicitly removed.
- **Android APK, no paid accounts**: `.github/workflows/android-apk.yml` runs `expo prebuild` and Gradle on GitHub's runners and publishes a GitHub Release. The newest build is always at `https://github.com/Bliuew/Maka/releases/latest/download/maka.apk`. Set the repository variable `MAKA_API_URL` to bake in your server.
- **Signing**: without keystore secrets the APK is signed with the public debug key. That is fine for testers, and updates install over each other, but Google Play won't accept it. `plugins/withReleaseSigning.js` switches to your upload keystore when the `MAKA_UPLOAD_*` secrets are set.
- **EAS** (`eas.json`): `preview` builds an internal APK and `production` builds a Play app bundle. Using EAS cloud builds needs a (free) Expo account. iOS builds always need the Apple Developer Program.
