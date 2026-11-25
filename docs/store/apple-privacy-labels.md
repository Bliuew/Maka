# App Store Connect: App Privacy ("nutrition label") answers

**Tracking:** No. Mäka doesn't link data with third-party data for advertising and doesn't share it with data brokers. No App Tracking Transparency prompt is needed.

For each type below the answers are: **collected: yes**, **linked to the user's identity: yes**, **used for tracking: no**.

| Apple data type | Purposes to select | Notes |
|---|---|---|
| Contact Info → Email Address | App Functionality | Sign-in and account recovery |
| Contact Info → Name | App Functionality | Display name and handle (need not be a legal name) |
| User Content → Photos or Videos | App Functionality | Only media the user posts. Metadata stripped |
| User Content → Audio Data | App Functionality | Soundtrack of posted videos |
| User Content → Emails or Text Messages | App Functionality | In-app direct and group messages ("Other User Content" also fits; pick one consistently) |
| User Content → Other User Content | App Functionality | Captions, comments, bios, reports, appeals |
| Identifiers → User ID | App Functionality | Account ID |
| Identifiers → Device ID | App Functionality (fraud and security) | Random per-install ID, stored hashed, for ban-evasion review. Not the IDFA |
| Purchases → Purchase History | App Functionality | Market orders. No card data |
| Usage Data → Product Interaction | App Functionality | Likes, follows, views (feeds and safety) |
| Sensitive Info | **Not collected** | The age check returns only an over-19 result. No ID images, biometrics or date of birth reach Mäka. *(The provider processes them under its own policy. Name the provider in the privacy policy.)* |
| Location, Health, Financial Info (payment), Contacts, Browsing/Search History, Diagnostics | **Not collected** | Revisit if you add analytics, crash reporting or payments. |

Privacy Policy URL: `https://<your-server>/privacy.html`

Account deletion: required by Apple guideline 5.1.1(v), and present in the app under Settings & safety → Delete account.
