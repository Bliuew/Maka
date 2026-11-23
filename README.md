# Mäka — Feel The Power Of Love Within You

Milestone 1 of the Mäka 19+ social platform: a working **backend API** and a **mobile-first app client** built from the approved prototype and `docs/CLAUDE_BUILD_BRIEF.md`.

## Run it

Requirements: **Node.js 22.5+** and **ffmpeg/ffprobe** on the PATH. There are no npm dependencies.

```bash
npm start                 # http://localhost:8080  (seeds clearly-labelled sample data in development)
npm test                  # 13 API + policy tests
npm run test:e2e          # 22-step acceptance demo in a phone-sized browser (needs Playwright + Chromium)
```

Dev moderator login: `trust.safety@sample.maka.test` / `dev-admin-password` (change it with `SEED_ADMIN_PASSWORD`).

**To try it on a phone:** run the server on a machine on your Wi-Fi, then open `http://<that-computer's-IP>:8080`. Use **Add to Home Screen** to install it with the bee icon. Camera upload and installing to the home screen need HTTPS, so for real devices put it behind HTTPS (for example a tunnel or your host's TLS).

## What works (tested)

| Area | Working now |
|---|---|
| Accounts | Sign-up, sign-in and sign-out. Passwords are hashed with scrypt. Sessions use hashed bearer tokens (no cookies, so no CSRF risk). Includes data export and account deletion. |
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
5. **Push notifications.** In-app realtime works. Native push needs APNs and FCM keys.
6. **Native iOS/Android apps (next milestone).** This build is a web client that installs to the home screen. The React Native / Expo app needs a session where npm installs are allowed, plus an Apple Developer account and a Google Play console for builds. It will call this same API. No store submission has happened.
7. **Scale and operations.** Planned moves: SQLite → Postgres with row-level security, local disk → object storage plus a transcoding queue, in-memory rate limits and realtime → Redis. Also needed: CI/CD, monitoring and backups. Every query is already written against a small helper, so the data layer can be swapped.
8. **Legal.** Terms, Privacy Policy, Community Guidelines and retention periods need legal review (GDPR, PIPEDA and local law). The registration ID, contact and appeal email addresses are placeholders.
9. **Branding.** `web/assets/icon-*.png` is an **interim** bee-only icon cut from the approved wordmark. Overlapping letter strokes were painted out and the bee was not redrawn (`scripts/make_bee_icon.py`). Swap in the illustrator's standalone transparent export when it's ready.

All sample creators, brands, products, campaigns and films are flagged `is_sample` or `is_placeholder`, labelled in the UI, and seeded only in development.

## Layout

```
server/   index.js · app.js · db.js (schema) · http.js · media.js · safety.js · age.js · seed.js · routes/*
web/      index.html · app.css · js/{api,core,ui,app,sections}.js · assets/
tests/    api.test.js · e2e.mjs · screens/ (latest E2E screenshots)
docs/     CLAUDE_BUILD_BRIEF.md
```

## Deploy a private staging server

The repo includes a `Dockerfile` (Node 22 + ffmpeg), a Render Blueprint (`render.yaml`) and `railway.json`.

- **Render:** New → Blueprint → pick this repo. Render generates `MAKA_SECRET`, `SEED_ADMIN_PASSWORD` and `INVITE_CODE`; find them under the service's **Environment** tab. A persistent disk is mounted at `/data`, so posts survive redeploys. Disks need a paid instance (Starter).
- **Railway:** New Project → Deploy from GitHub repo, then add a Volume mounted at `/data` and set `NODE_ENV=staging`, `MAKA_SECRET`, `INVITE_CODE` and `SEED_ADMIN_PASSWORD`.

Staging runs the **labelled age-verification simulator**, so keep it invite-only (`INVITE_CODE`). The server refuses `NODE_ENV=production` until a real 19+ provider is connected.
