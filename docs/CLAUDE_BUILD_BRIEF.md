# Claude development brief: Mäka social media mobile app

## Objective

Build **Mäka** (spelled exactly with ä) as a real, secure, working, mobile-first social and entertainment ecosystem for iOS and Android, with production-ready architecture and an API/backend. The frontend prototype `index.html` supplied alongside this brief is the starting UX reference, **not** a finished implementation.

**Brand tagline:** Feel The Power Of Love Within You. Origin of name: Igbo *Amaka*. Use the exact approved original image `assets/approved-logo.webp`. The production app icon must display **only the bee illustration** extracted/exported from that approved wordmark (the included `bee-icon.svg` is a placeholder; replace it with the founder-approved standalone art). **Do not redesign the logo.**

## Absolute founder decisions (do not overrule)

1. **Strictly 19+** users worldwide, with no minor accounts or parental exceptions; age must be assured before any access, using a privacy-first third-party provider that specifically supports the **19+** threshold. Offer several country-appropriate options: government photo ID; ID + selfie/liveness when warranted; validated digital credentials; bank-linked age confirmation where supported; and reliable fallback/manual review. Users choose a suitable method—they must NOT do all methods. Don't store government IDs/selfies unless unavoidably required; use verified over-19 tokens. Do not fake or claim a verification integration if absent.
2. **No subscriptions for movie viewing.** Movies and shows can be watched for free only when properly licensed for the user's location and period; do not embed unauthorized movies. The streaming service needs rights inventory, geographic gating, CDN, captions, mature-content ratings and (as appropriate) ad funding and rights-holder revenue splits.
3. **Creator opportunity equality.** Display follower counts publicly, but follower totals must **not** control eligibility, preferential recommendation weighting, monetization access, collaboration ranking, or tiers. Never create nano/micro/mega tier systems or minimum follower thresholds. Allow businesses to select on objective fit, quality, reliability, legitimate engagement, and campaign needs. Fraud signals must prevent engagement manipulation. Earnings differ by actual compliant revenue, not follower count.
4. **User safety.** No bullying, racism, discriminatory abuse, threats, doxxing, coordinated harassment, or stitching designed to ridicule a person. Respectful disagreement and legitimate constructive criticism remain permitted. Do not display public dislike counts. Provide granular stitch/remix permissions, reporting, blocking, muting, comment filtering, rate limits, human review, evidence retention policies, appeals, graduated sanctions and ban-evasion detection. Don't rely solely on IP bans (shared/dynamic IPs and evasion). Recommenders must not reward abusive outrage.
5. All public age-eligible users may view, create original posts, photos and videos, discover creators, follow, engage and converse. Content and brand availability depend on applicable laws and rights.
6. The app must be a **real social-media inside experience**, not a promotional marketing landing page. Home opens to a TikTok-like immersive vertical feed with working video playback and gestures, interactive comments, creator profiles, shares and saves. Separate Cinema, Create, Collabs, Market, Inbox and Profile experiences in a consistent navigation shell. Original product style: midnight charcoal, honey-gold highlights, warm cream. Avoid copying competitors' actual logos/code/design assets.

## Architecture and acceptance goals

- Recommended: React Native / Expo for native mobile app, TypeScript, secure API/backend, Postgres/Supabase or equivalent, object media storage + transcoding/CDN, background tasks, realtime message service, analytics with privacy controls, Stripe Connect or permitted payout provider. Choose services based on regional availability and cost; avoid unnecessary vendors.
- Working sign-up/sign-in, session security, ID-based 19+ age-check integration or a clearly marked stub behind feature flag until provider credentials exist. Never allow real access to an unverified user when in production.
- Videos: record/select, upload resumably, scan/validate, encode, publish, render in infinite vertical feed with autoplay/pause, like/comment/follow/save/share/report, discovery and following tabs. Ensure accessibility, captions, moderation, privacy and creator consent.
- Movies: licensor portal for metadata/rights, territory and term entitlement checks, ad-supported free playback, watch history, continue watching, searchable genre and language collections. Until licensing exists, show **clearly fictional placeholder titles with no working movie playback**.
- Collaborations: business verification, campaign briefs, open application to ALL eligible creators, messages/negotiations, contract and paid fulfilment workflow, disclosures, payout records, dispute handling; no follower cutoffs or tiers.
- Market: verified businesses, product listings/catalogue, order flow, refund/dispute handling and secure checkout; payments never stored as raw card data.
- Messaging: private 1:1 chats, group conversations, inbox, notifications, blocking/reporting and privacy settings. Protect minors from access at registration rather than pretending a profile badge provides proof.
- Creator Studio: drafts, uploads, statistics, eligible earnings, campaign history, payouts, creator rights and content permissions. No misleading sample income data passed off as real.
- Admin: reports and appeals queues, escalation, content/risk actions, moderation rules, verification status, film rights, payouts and business compliance. Auditable admin actions.
- Security: authorization/RLS, rate limiting, anti-bot and fraud detection, secure media URLs, CSRF protections as appropriate, non-public personal data, consent/retention/deletion, GDPR/PIPEDA and applicable local legal review, incident response.
- App quality: real navigation, state persisted appropriately, responsive performance, notifications, offline/reconnect recovery, screen-reader labels, camera/media permissions, automated tests, CI/CD. Provide iOS and Android dev builds for testing and do not falsely claim store submission.
- Deliver milestones, not placeholder buttons pretending to work. Build and test a vertical working slice (age gate in test mode, sign-up, profile, post video, feed, comments, safety/reporting) first, then add Cinema, Collabs, Market and payments/licensing integrations as credentials and partnerships become available.

## Branding caution

Use the founder-approved Lovart artwork unchanged. The bee-only app icon needs the illustrator's standalone transparent export; the temporary SVG in this project is not the finalized symbol. The exact spelling of Mäka and capitalization of the tagline should be preserved. Do not create unapproved brand names or new logos.

## Acceptance demonstration

Show concrete working interactions: register a test adult, upload and watch own short video, switch For You/Following, follow a creator, leave a comment, report and block a user, browse a sample film without pretending rights exist, submit an open collaboration application regardless of follower count, and navigate a marketplace storefront. Identify every remaining stub explicitly. No silent substitution of mocks for real functionality.
