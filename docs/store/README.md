# Store readiness: TestFlight (iOS) and Google Play (Android)

> **Status: prepared, NOT submitted.** Nothing has been uploaded to App Store Connect, TestFlight or the Google Play Console. Both need accounts that only you can create (see "Blocked on you" below).

| Document | Use it for |
|---|---|
| [`listing.md`](listing.md) | Store listing text, category, contact and URLs, and the screenshot list |
| [`google-play-data-safety.md`](google-play-data-safety.md) | Answers for Play Console → App content → **Data safety** |
| [`apple-privacy-labels.md`](apple-privacy-labels.md) | Answers for App Store Connect → **App Privacy** |
| [`age-rating.md`](age-rating.md) | Age-rating questionnaires (Apple, and IARC on Google Play) and the 18+ / 19+ notes |
| [`ugc-moderation.md`](ugc-moderation.md) | How Mäka meets the user-generated-content rules (Apple guideline 1.2, Google Play UGC policy), plus text for the review notes |
| [`review-notes.md`](review-notes.md) | What to paste into "Notes for review" / "App access", and the demo account you need to create |

Public pages (served by the API server from `web/`, so they exist wherever the server is deployed):

- Privacy Policy: `https://<your-server>/privacy.html`
- Terms of Use: `https://<your-server>/terms.html`
- Community Guidelines: `https://<your-server>/guidelines.html`
- Account deletion (Google Play requires a web link): `https://<your-server>/account-deletion.html`

All four are **drafts for legal review**. Each page marks its placeholders, such as the legal entity, contact emails and retention periods.

## Checklist

### Both stores
- [ ] Deploy the API to a stable **HTTPS** domain and set `MAKA_API_URL` (GitHub variable) / `EXPO_PUBLIC_API_URL` (EAS env).
- [ ] Connect a **real 19+ age-assurance provider**. Production refuses to start with the simulator, and reviewers must be able to get past the gate (see `review-notes.md`).
- [ ] Have a lawyer review the privacy policy, terms and guidelines, and fill in the placeholders.
- [ ] Commit to acting on reports within 24 hours, and staff the moderation queue (Apple expects this for UGC apps).
- [ ] Confirm the bundle ID / package (`io.github.bliuew.maka`) or change it to your own domain **before the first upload**. It can't change afterwards.
- [ ] Replace the interim bee icon with the illustrator's standalone transparent export if you want a crisper icon (the current one is cut from the 512 px wordmark).

### Google Play (internal testing → closed testing → production)
- [ ] Google Play Console developer account (one-time US$25 fee, identity verification).
- [ ] Generate an **upload keystore** and add the `MAKA_UPLOAD_*` secrets (see `mobile/README.md`), then enrol in Play App Signing.
- [ ] Build an **app bundle** (`eas build -p android --profile production`, or Gradle `bundleRelease` with the same signing).
- [ ] App content: privacy policy URL, ads (none today), app access (demo account), content rating (IARC), target audience (**18+ only**), data safety, account-deletion URL, news app (no), government app (no).
- [ ] Personal developer accounts created after November 2023 must run a **closed test with at least 12 testers for 14 days** before production access.

### Apple (TestFlight → App Store)
- [ ] Apple Developer Program membership (US$99/year).
- [ ] An App Store Connect app record with bundle ID `io.github.bliuew.maka` (or your own).
- [ ] An iOS build: `eas build -p ios --profile production` (needs an Expo account linked to your Apple account), or a Mac with Xcode after `npx expo prebuild -p ios`.
- [ ] App Privacy answers (`apple-privacy-labels.md`), age rating 18+ (`age-rating.md`), review notes and demo account (`review-notes.md`).
- [ ] External TestFlight testers need a Beta App Review. Internal testers (up to 100 team members) don't.

## Blocked on you (accounts, money or legal)

| Needed | Why | Cost |
|---|---|---|
| Apple Developer Program | TestFlight and the App Store | US$99/year |
| Google Play Console | Play distribution | US$25 once |
| A real 19+ age-assurance provider (e.g. Yoti, Persona, Veriff, IDnow) | The gate must be real in production, and reviewers must pass it | Contract, per-check fees |
| A lawyer | Privacy policy, terms and guidelines | — |
| Hosting with HTTPS, Postgres and S3-compatible storage | The app needs a live server | Monthly |
| APNs key and Firebase project (optional for launch) | Push notifications | Free |
| Stripe Connect or similar, and film licences | Only if you launch Market checkout, payouts or Cinema playback | Contracts |
