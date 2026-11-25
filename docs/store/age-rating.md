# Age rating notes (18+ in the stores; 19+ in the app)

Mäka is **strictly 19+ worldwide**. Neither store has a 19+ rating, so pick the **highest available (18+)** in each store. The app itself enforces 19+: every account must pass a 19+ age check before any community feature unlocks, and the server refuses every community API call until then. Say this plainly in the review notes.

## Apple (App Store Connect → Age Rating)

Answer the questionnaire honestly for what the app can contain. Because the content is user-generated, describe the worst case that moderation still allows (it may appear briefly before removal):

| Question | Suggested answer | Why |
|---|---|---|
| Unrestricted web access | No | No in-app browser; links open the system browser |
| User-generated content | **Yes** | Posts, comments, messages |
| Messaging and chat | **Yes** | Direct and group messages |
| Advertising | No (today) | Change to Yes when Cinema ads launch |
| Profanity or crude humour | Infrequent/mild | UGC |
| Mature or suggestive themes | Infrequent/mild | Films are rated 19+; UGC |
| Sexual content or nudity | None (prohibited by guidelines) | Not permitted; removed on report |
| Violence (cartoon / realistic) | Infrequent/mild | Film trailers and UGC |
| Gambling, contests, loot boxes | No | |
| Medical / wellness | No | |
| **Override to a higher rating / "18+"** | **Yes, select 18+** | Matches the platform's adult-only policy |

Also turn on **"Age assurance"** / age-verification declarations if App Store Connect asks for them. Apple's newer age-rating flow asks whether the app has its own age verification. Answer **yes**: a third-party age-assurance provider with a 19+ threshold, and only the result is stored.

## Google Play

- **Content rating (IARC questionnaire):** category "Social networking / communication". Answer **yes** to user interaction, users sharing content, and users communicating with each other. Disclose that users can share photos and videos. The result will typically include the "Users Interact" interactive element.
- **Target audience and content:** select **18 and over only**. Don't select any younger age group. That keeps the app out of the Families policy, which it must not join.
- **Appeal to children:** "No". Make sure store graphics don't look aimed at children.
- **Restrict to adults:** in your release notes and description, state "Strictly 19+. Age verification required."

## Regional notes

- South Korea applies its own content rating to some apps (GRAC). Treat that as legal review, not something to self-declare.
- Some jurisdictions require age assurance for social media by law (for example Australia's under-16 minimum). The app's 19+ gate is stricter than these, but the **provider's** method must be acceptable to each regulator.
