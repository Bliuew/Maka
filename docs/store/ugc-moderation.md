# User-generated content: moderation description for app review

Apple guideline **1.2** and Google Play's **User Generated Content** policy require:

1. a method for filtering objectionable material;
2. a way to report offensive content, with timely responses;
3. the ability to block abusive users;
4. published contact information;
5. terms users accept, with zero tolerance for objectionable content.

Mäka's answers are below. Each point names where it lives in the app and the code, so a reviewer (or you) can check it.

| Requirement | How Mäka meets it | Where |
|---|---|---|
| **Terms with zero tolerance** | Sign-up requires accepting the Community Guidelines and Terms. The Terms say there is no tolerance for objectionable content or abusive users. | Sign-up screen. `web/terms.html`, `web/guidelines.html` |
| **Filtering objectionable content** | Comments, captions and messages are screened before publishing. Threats, encouragement of self-harm, insults aimed at a person, and possible private information (addresses, phone numbers) are **held for human review** instead of being published. Trust & Safety can load a maintained hate-speech list (`MAKA_LEXICON_FILE`). Creators can add their own keyword filters for comments on their posts. Constructive criticism passes. | `server/safety.js`. Settings & safety → keyword filter |
| **Reporting** | Every post, comment, message and account has **Report**, with reasons including bullying, racism, threats, doxxing, **stitch/remix made to ridicule someone**, coordinated harassment, sexual content, suspected under-19 user, spam and copyright. Reporting and blocking can be done in one step. Reporters are never identified to the person reported. If three or more people report the same post or comment for a severe reason, it is hidden until a person reviews it. | Feed → ⋯ → Report. Profile → ⋯. Comment ⚑. Message "Report". `server/routes/social.js` (`/api/reports`) |
| **Timely response** | The moderation queue is ordered by severity (threats and suspected minors first). Each entry shows an evidence snapshot, the person's sanction history and a suggested next step. **Operational commitment needed from you:** act on reports within 24 hours. | Admin → Trust & Safety. `server/routes/admin.js` |
| **Blocking** | Block from any profile or post. Blocking hides each person's content from the other and stops comments, follows and messages both ways. Mute is also available. A person can see and undo their blocks. | Profile → ⋯ → Block. Settings & safety → Blocked accounts |
| **Sanctions** | Graduated: warning → restriction (7 days) → suspension (30 days) → permanent ban. Every action needs a written reason, which is shown to the user, and is recorded in an audit log. | `server/routes/admin.js` |
| **Appeals** | Users appeal from Settings & safety → Account standing. **A different reviewer must decide the appeal.** The server rejects decisions by the original moderator. | `/api/appeals`, `/api/admin/appeals/:id/decide` |
| **Ban evasion** | Bans block the age-verified identity (a keyed hash of the provider's person reference), not just an IP address. A new account by the same person is held for review. A device match only creates a review report, because devices are shared. | `server/routes/auth.js`, `server/routes/admin.js` |
| **Minors** | Strictly 19+. There is no access before age verification, and an under-19 result closes the account. "User may be under 19" is a top-priority report reason. | `server/app.js` (gate), `server/routes/auth.js` |
| **Contact information** | Support and privacy contacts on the policy pages *(placeholders: fill in before submission)*. Appeals in the app. | `web/privacy.html`, `web/terms.html` |

## Text for "Notes for review" (UGC section)

> Mäka is an adults-only (19+) social app with user-generated videos, photos, comments and messages. Users must accept the Community Guidelines and Terms (zero tolerance for objectionable content) and pass a third-party 19+ age check before any community feature is available. Abusive text (threats, insults aimed at a person, personal information) is automatically held for human review. Every post, comment, message and profile can be reported, including a specific reason for stitches or remixes made to ridicule someone. Report-and-block is one step, and blocking removes all contact both ways. Our Trust & Safety team reviews reports, highest severity first, within 24 hours, using graduated sanctions. Appeals are decided by a different reviewer, and all actions are audited.

## Gaps to close before claiming more

- No automated image or video classifier yet, and no CSAM hash matching (e.g. PhotoDNA). Both need vendor agreements. Until then, describe filtering as text screening plus human review. Don't claim AI visual moderation.
- Push notifications for moderation outcomes need APNs/FCM keys. Today outcomes are delivered as in-app notifications.
