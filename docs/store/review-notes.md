# Notes for review and "App access"

Both stores need reviewers to get past sign-in **and the 19+ gate**.

## The problem to solve first

Production refuses to run the age-verification **simulator**. That's deliberate, and it must stay that way. So reviewers can only get in once one of these is true:

1. **A real provider is connected** and you give reviewers a **demo account that is already verified**: you or a colleague (an adult) complete the real check once for an account you create for review. Only the outcome is stored, so the reviewer just signs in.
2. **Manual review:** the provider's manual-review method approves the demo account.

Either way, create the demo account on the **production** server you submit against, and keep it in good standing.

> Don't point a store build at a staging server running the simulator so reviewers can "verify" themselves. That would show reviewers a fake age check, which goes against the founder's policy and both stores' rules.

## Paste into App Store Connect → App Review Information → Notes (and Play → App access)

```
Demo account (already age-verified, 19+):
  Email:    [placeholder]
  Password: [placeholder]

Mäka is strictly 19+. New accounts must pass a third-party age check (one method of the
user's choice; we store only the result) before any community feature is available — the
demo account above has already passed it.

Where to find things:
- Feed: Home tab (swipe up/down, tap to pause, double-tap to like)
- Report / block: "⋯" on any post or profile; "⚑" on comments; "Report" on messages
- Blocked accounts, filters, account deletion: Profile → Settings & safety
- Community Guidelines and Terms: linked at sign-up and in Settings & safety

Cinema only plays titles licensed for the viewer's region. If no titles are licensed at the
time of review, Cinema shows clearly labelled placeholders that cannot be played.
Market checkout is disabled until our payment provider is connected; orders show
"no payment has been taken".
```

## Other review checks

- **Account deletion** works in the app (Settings & safety → Delete account) and on the web (`/account-deletion.html`).
- **No placeholder or sample content in production.** Sample data seeds only outside production (`SEED_SAMPLES=0` is enforced). Make sure reviewers see real, moderated content, or an honest empty state.
- **Payments:** Market sells physical goods, so external payment processing (Stripe) is allowed by Apple guideline 3.1.3(e). Collab payouts are services between users and businesses. Cinema is free, so there are no in-app purchases. Re-check this whenever you add tipping, coins or subscriptions, which would require Apple IAP / Google Play Billing.
