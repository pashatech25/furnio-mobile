# Trial access UI repair — September 10, 2026

The mobile catalogue previously displayed all enabled services without the website's trial locks, and the home/wallet omitted the remaining-preview allowance. Server single-job billing already rejected excluded trial services; this repair does not change the database, trial entitlements, grants, or processing rules.

- Mirrored web trial-context remaining/locked/funded rules in native funding helpers.
- Home, catalogue, wallet and accessible studios display remaining watermarked previews separately from spendable credits.
- Catalogue cards and home shortcuts respect the account's allowedServiceSlugs. Direct studio routes are also gated. Existing uncertain-submission recovery remains reachable.
- Sufficient paid/Admin-granted credits retain access to services outside the trial. Unknown balance/status stays gated.
- Single submit checks both entitlement and funds; batch confirmation and submit require sufficient spendable credits, never complimentary previews.
- TypeScript, diff check, and all 1,102 tests passed. Signed iPhone and Android builds passed.
- iPhone update installed, but owner device was locked, preventing live account-screen verification. No live paid processing or database mutation performed.
# September 10 follow-up: refresh after consumption

Owner saw 3/3 after completing a trial image while web correctly showed the reduced allowance. Result polling updated only job state; Home retained cached account data. Terminal job reads now invoke the existing identity-guarded account refresh. Home also refreshes on navigation focus and foreground return. No local subtraction or trial grants; `/api/trial` remains authoritative. Queued/running polls do not repeatedly refresh the account. Targeted terminal-status regression added. Physical counter confirmation remains required.
