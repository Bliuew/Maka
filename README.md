# Mäka — Feel The Power Of Love Within You

Milestone 1 of the Mäka 19+ social platform: a working **backend API** and a **mobile-first app client** built from the approved prototype and `docs/CLAUDE_BUILD_BRIEF.md`.

## Run it

Requirements: **Node.js 22.5+**, **ffmpeg/ffprobe** on the PATH, **PostgreSQL**, and an **S3-compatible bucket** in production. `docker compose up -d` starts Postgres locally (add `--profile s3` for an S3 emulator).

```bash
docker compose up -d      # Postgres 16 for development
cp .env.example .env && set -a && . ./.env && set +a
npm ci
npm start                 # http://localhost:8080  (seeds clearly-labelled sample data in development)
npm test                  # API + policy tests (against DATABASE_URL, and S3 when S3_BUCKET is set)
npm run test:e2e          # 22-step acceptance demo in a phone-sized browser (npx playwright install chromium first)
```

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required). `DATABASE_SSL=1` forces TLS. `DATABASE_SCHEMA` isolates a run in its own schema (tests use this). |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=1` | Media storage in any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2, Wasabi). Without `S3_BUCKET` media is kept on local disk, which is allowed **only outside production**. `S3_CREATE_BUCKET=1` creates the bucket (dev/CI). |
| `MAIL_PROVIDER` (`resend` or `postmark`), `MAIL_API_KEY`, `MAIL_FROM` | Email for password resets. Required in production. Without it (outside production) reset emails are not sent; the link is printed in the server log instead. |

Uploaded chunks are stored as parts in the bucket and the byte offset is kept in Postgres, so a resumable upload can continue on a different server instance. Transcoding runs in a temporary directory, and the results (`media/<id>/video.mp4`, `poster.jpg`) are uploaded back. Media is still served through signed, expiring `/media/...` URLs with Range support, which are proxied from the bucket.

Dev moderator login: `trust.safety@sample.maka.test` / `dev-admin-password` (change it with `SEED_ADMIN_PASSWORD`).

**To try it on a phone:** run the server on a machine on your Wi-Fi, then open `http://<that-computer's-IP>:8080`. Use **Add to Home Screen** to install it with the Mäka app icon. Camera upload and installing to the home screen need HTTPS, so for real devices put it behind HTTPS (for example a tunnel or your host's TLS).

## What works (tested)

| Area | Working now |
|---|---|
| Accounts | Sign-up, sign-in and sign-out. Passwords are hashed with scrypt. Sessions use hashed bearer tokens (no cookies, so no CSRF risk). Includes data export, account deletion and **password reset by email** (single-use links that expire in 30 minutes, stored only as a hash, and that sign you out everywhere; the response never reveals whether an email has an account). |
| 19+ gate | A user picks **one** method: government ID, ID + selfie, digital credential, bank, or manual review. Nothing in the community is reachable until the check is verified. An under-19 result closes the account and scrubs its personal data. Only the outcome is stored, never ID images. |
| Video | Chunked, **resumable** uploads. ffprobe validates the file and rejects non-media. ffmpeg transcodes to H.264/AAC with faststart, creates a poster frame, and strips metadata including location. Media URLs are signed and expiring, with Range streaming. Supports WebVTT captions, alt text and drafts. |
| Feed | Full-screen vertical snap feed. Videos autoplay when in view and pause when not. The next video preloads. Tap pauses, double-tap likes, mute toggles. Includes For You / Following, infinite loading, view counting, keyboard navigation and screen-reader labels. |
| Social | Like, save, share (native share sheet or copied link), comments, follow, profiles, search, notifications, and private "not interested". **No dislike count exists anywhere.** |
| Ranking | Ranks on engagement quality, freshness and an exposure boost for under-seen creators. It **never reads follower counts** (a test enforces this). Open safety reports down-rank a post, and held or removed comments add nothing to its score. |
| Safety | Report reasons include "stitch/remix made to ridicule someone". Users can report and block in one step, block, mute, and filter comments by keyword. Stitch/remix permissions can be set per post. Threats, insults aimed at a person, and possible doxxing are **held for human review** rather than published. Constructive criticism passes. Rate limits cover comments, messages, follows, uploads and sign-up. |
| Moderation | A priority report queue shows sanction history and a suggested next step (warning → restrict → suspend → ban). Evidence snapshots are kept. A different reviewer must decide each appeal. Every action is written to the audit log. |
| Ban evasion | Bans block the **verified identity** (a keyed hash of the age provider's person reference), not the IP address. A new account from the same person is held for review. Device matches only create review reports, because devices can be shared. |
| Messaging | 1:1 and group chats, realtime delivery (SSE with automatic reconnect), unread counts, and who-can-message-me settings. Blocking is enforced. Threatening messages are held. |
| Cinema | Catalogue with filters, My List and continue-watching. A title plays **only** when a rights window covers the viewer's territory and a licensed stream exists. Placeholder titles can never play. Includes an admin licensing portal for titles and rights windows. |
| Collabs | Businesses must be verified before posting. Briefs **reject follower minimums or tiers**, both as fields and in the brief text. Any verified creator can apply. Applications open a brand conversation. Contracts move through offer → sign → deliver → approve, and approval adds a pending earnings entry. |
| Market | Storefronts for verified businesses, product listings, search, and a bag. Orders are priced on the server, check stock, and can be cancelled. Checkout **refuses** to run until a payment provider is connected. |
| Studio | Real stats, drafts, processing/held items, an earnings ledger (starts at $0, no sample income), applications and contracts, and business tools. |
| Admin | Reports, appeals, business verification, titles and rights, and the audit log. |

## Stubs and items needing credentials, contracts or more work

1. **Age verification provider.** A test simulator stands in for it and is labelled TEST on screen. The server **refuses to start in production** with it. Needs: a contract with a provider that supports a 19+ threshold (e.g. Yoti, Persona, Veriff, IDnow), API keys, and a webhook adapter in `server/age.js`. `/api/age/webhook` returns 501 until then.
2. **Payments and payouts.** Needs Stripe Connect or an equivalent: KYC for businesses and creators, tax handling, and refunds and disputes through the provider. Checkout returns `payments_not_configured`. Approved collaborations show as *pending* and are never paid out.
3. **Film licensing.** No titles are licensed. Needs rights contracts, a CDN with DRM/HLS, an ad server (SSAI), captions per title, and a trusted geo-IP service. The territory is currently a config value (`DEFAULT_TERRITORY=CA`).
4. **Automated moderation.** The text screen is a deterministic first layer. Needs a hate-speech lexicon maintained by Trust & Safety (`MAKA_LEXICON_FILE`), ML text and image/video classifiers, CSAM hash matching (e.g. PhotoDNA), and malware scanning of uploads (`MEDIA_SCANNER`).
5. **Email.** Password-reset email is built for Resend or Postmark. Needs an account with one of them, a verified sending domain, and `MAIL_PROVIDER`, `MAIL_API_KEY` and `MAIL_FROM`.
6. **Push notifications.** In-app realtime works. Native push needs APNs and FCM keys.
7. **Native apps and stores.** The Expo app in `mobile/` is built. Android APKs are built by GitHub Actions and published as GitHub Releases. iOS builds need the Apple Developer Program. **Nothing has been submitted to TestFlight or Google Play.** `docs/store/` has everything prepared for submission and the steps that need your accounts.
8. **Scale and operations.** Done: PostgreSQL and S3-compatible object storage, and CI against both. Still to do: transcoding still runs inside the web process, so it should move to a job queue. Rate limits and realtime fan-out are in-memory, so several instances need Redis (or Postgres LISTEN/NOTIFY). Monitoring, backups and Postgres row-level security also need setting up.
9. **Legal.** Terms, Privacy Policy, Community Guidelines and retention periods need legal review (GDPR, PIPEDA and local law). The registration ID, contact and appeal email addresses are placeholders.
10. **Branding.** The app icon is the founder's honeycomb "M" design (`web/assets/app-icon-design.webp`, supplied 25 Nov 2026 and replacing the earlier bee-only icon). Every icon size is generated from it by `mobile/scripts/make_app_icons.py`, which only resizes it. The supplied file is 512 px, so the 1024 px store icon is slightly soft. Export the same design at 1024 px or larger, or as SVG, and run the script again. The approved wordmark (`approved-logo.webp`) is unchanged and is still used on the welcome screen.

All sample creators, brands, products, campaigns and films are flagged `is_sample` or `is_placeholder`, labelled in the UI, and seeded only in development.

## Native app (Android and iOS)

`mobile/` is an Expo (React Native, TypeScript) app with the same screens and policies as the web client. See [`mobile/README.md`](mobile/README.md).

- **Android test build:** the latest APK is always at <https://github.com/Bliuew/Maka/releases/latest/download/maka.apk>, or scan [`docs/android-download-qr.png`](docs/android-download-qr.png). Testers allow "install from this source" when asked. Until you set the `MAKA_API_URL` repository variable, enter your server's HTTPS address on the welcome screen (Server settings).
- **Store readiness:** [`docs/store/`](docs/store/README.md) has the privacy, data-safety, age-rating and UGC-moderation answers and the review notes. Not submitted.
- **Policy pages** served by this server: `/privacy.html`, `/terms.html`, `/guidelines.html`, `/account-deletion.html`. These are drafts that need legal review.

## Layout

```
server/   index.js · app.js · db.js (Postgres schema + helpers) · storage.js (S3 / local) · http.js · media.js · safety.js · age.js · seed.js · routes/*
web/      index.html · app.css · js/{api,core,ui,app,sections}.js · assets/ · privacy/terms/guidelines/account-deletion pages
tests/    api.test.js · e2e.mjs · screens/ (latest E2E screenshots)
mobile/   Expo app: src/app (screens) · src/core (tested client logic) · src/lib · plugins · tests
docs/     CLAUDE_BUILD_BRIEF.md · store/ (submission prep) · android-download-qr.png
.github/  workflows/ci.yml (API, E2E, mobile) · workflows/android-apk.yml (APK → GitHub Release)
```

## Deploy a private staging server

The repo includes a `Dockerfile` (Node 22 + ffmpeg), a Render Blueprint (`render.yaml`) and `railway.json`. The container is stateless: data is in Postgres and media in your bucket.

- **Render:** New → Blueprint → pick this repo. It creates a Render PostgreSQL database and wires `DATABASE_URL`. Render generates `MAKA_SECRET`, `SEED_ADMIN_PASSWORD` and `INVITE_CODE` (find them under the service's **Environment** tab). Fill in the `S3_*` values for your bucket (for example Cloudflare R2).
- **Railway:** New Project → Deploy from GitHub repo, add the **PostgreSQL** plugin (it sets `DATABASE_URL`), then set `NODE_ENV=staging`, `MAKA_SECRET`, `INVITE_CODE`, `SEED_ADMIN_PASSWORD` and the `S3_*` values.

Staging runs the **labelled age-verification simulator**, so keep it invite-only (`INVITE_CODE`). The server refuses `NODE_ENV=production` until a real 19+ provider is connected.

## Run on Replit (Core)

1. In Replit choose **Create App → Import from GitHub** and pick `Bliuew/Maka`. The included `.replit` and `replit.nix` set up Node 22 and ffmpeg.
2. Open **Secrets** and add `MAKA_SECRET` (any long random text), `INVITE_CODE` (the code testers type at sign-up) and `SEED_ADMIN_PASSWORD` (moderator password).
3. Press **Run** to try it in the preview, then **Publish → Reserved VM**. You get a `https://<name>.replit.app` address.

**Data persistence:** add Replit's **PostgreSQL** database (it sets `DATABASE_URL`). For media, add `S3_*` secrets for an S3-compatible bucket such as Cloudflare R2. Replit's own App Storage does not offer S3 keys, so the S3 driver can't use it.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. It has two jobs, and both use a Postgres 16 service and an S3-compatible server (moto):

- **API tests:** `npm test`.
- **End-to-end:** `npm run test:e2e` in headless Chromium at iPhone 13 size. The screenshots are uploaded as a build artifact.
