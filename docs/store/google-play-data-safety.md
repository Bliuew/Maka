# Google Play: Data safety answers

These answers describe what the app and server do **as of this commit**. Re-check them whenever you add an SDK (analytics, crash reporting, ads, push) or connect payments.

## Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes.** Release Android builds only allow HTTPS servers. Deploy the API behind HTTPS. |
| Do you provide a way for users to request that their data is deleted? | **Yes.** In-app: Settings & safety → Delete account. Web: `https://<your-server>/account-deletion.html` |
| Has your app been independently validated against a global security standard (MASA)? | No |

## Data collected

"Shared" means transferred to a third party for its own purposes. Service providers acting on Mäka's behalf (hosting, storage, the age-check provider) are **not** sharing under Google's definition. No data is sold, and none is used for advertising or marketing today.

| Data type (Play category) | Collected | Shared | Required or optional | Purposes | Notes |
|---|---|---|---|---|---|
| **Personal info → Email address** | Yes | No | Required | Account management, Fraud prevention, security & compliance | Sign-in and account recovery. |
| **Personal info → Name** | Yes | No | Required | App functionality, Account management | Public display name and handle (need not be a legal name). |
| **Personal info → User IDs** | Yes | No | Required | App functionality, Account management, Fraud prevention | Account ID, plus a keyed one-way hash of the age-check provider's person reference (ban evasion). |
| **Personal info → Other info** | Yes | No | Required | Fraud prevention, security & compliance | **Age-verification outcome** only (over 19: yes/no, method, time). ID images, selfies and date of birth are never received or stored. Business registration numbers, only from users who register a business. |
| **Photos and videos → Photos / Videos** | Yes | No | Optional | App functionality | Only what the user chooses to post or set as a profile photo. Metadata (including location) is stripped on processing. |
| **Audio → Voice or sound recordings** | Yes | No | Optional | App functionality | The soundtrack of videos the user records or uploads. |
| **Messages → Other in-app messages** | Yes | No | Optional | App functionality, Fraud prevention, security & compliance | Direct and group messages. Messages that look abusive are held for human review. |
| **Files and docs** | Yes | No | Optional | App functionality | Optional WebVTT caption files attached to posts. |
| **App activity → App interactions** | Yes | No | Required | App functionality | Likes, follows, saves, views, "not interested", blocks, mutes. Used for feeds and safety features. Not used for advertising. |
| **App activity → Other user-generated content** | Yes | No | Optional | App functionality, Fraud prevention, security & compliance | Captions, comments, bios, reports and appeals. |
| **App activity → In-app search history** | **No** | — | — | — | Search terms are not stored. |
| **Financial info → Purchase history** | Yes | No | Optional | App functionality | Market orders (items, totals, status). **Card details are never handled by Mäka.** Payments aren't live yet. When a payment provider is connected, revisit "Payment info" (the provider collects it, not Mäka). |
| **Device or other IDs** | Yes | No | Required | Fraud prevention, security & compliance | A random per-install identifier, stored only as a one-way hash, used to flag possible ban evasion **for human review**. Not the advertising ID. |
| Location (approximate or precise) | **No** | — | — | — | Location permissions are explicitly removed from the app. Film territory is decided by the server, not by device location. |
| Contacts, Calendar, Web browsing, Health & fitness | **No** | — | — | — | |
| App info and performance (crash logs, diagnostics) | **No** | — | — | — | No crash-reporting or analytics SDK is included. Revisit if you add one (e.g. Sentry). |

**Ephemeral processing:** IP addresses are used only in memory for rate limiting. The app doesn't store them. Your hosting provider may keep network logs, so check its terms.

## Permissions declared by the Android build

`CAMERA`, `RECORD_AUDIO` (recording videos), `READ_EXTERNAL_STORAGE` (choosing media on older Android versions), `INTERNET`, `VIBRATE`. Explicitly removed: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `READ_CONTACTS`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE`.
