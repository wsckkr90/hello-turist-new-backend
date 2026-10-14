# Public SOS contact and pricing rollout notes

## Public SOS contact

The project owner approved the public support/SOS contact **+917095101130**. The sample environment now sets `ADMIN_SUPPORT_PHONE=+917095101130` so a fresh staging setup has a clear default.

This file is only an example. It does **not** change the running VPS environment. Before enabling the app's SOS/urgent-call flow, set the same value in the actual service environment (for the existing VPS, `/opt/hello-turist-new-backend/.env`), restart only during an approved deployment window, and smoke-test `GET /api/v1/support/contact`. Do not paste secrets into GitHub.

The home-screen SOS widget must create an authenticated emergency incident and share the user's latest location when available; the phone number is a separate manual call fallback. Do not claim an SOS has reached responders unless the API confirms the incident was created. Native home-screen widget and background location/SOS flow still require Android build and device testing.

## Monthly pass pricing

Do not set a fixed `MONTHLY_PASS_PRICE_INR` until the product owner confirms the tariff formula. The latest requirement says price depends on kilometres and ads, which is not yet precise enough to safely calculate an amount. The backend must remain server-authoritative; never trust an amount sent by Android. Define whether the pass is distance-tiered, has included kilometres, has an overage rate, and whether ads affect price or rewards. Once approved, implement a server-side quote/price snapshot and tests for boundaries, payment verification, and idempotent activation.

## Wallet and payout safety

Razorpay payment webhooks confirm incoming collections; they do not transfer earnings to a driver's/guide's bank or UPI. Until a payout provider is explicitly enabled or an audited manual settlement workflow is agreed, wallet withdrawals must be represented as payout requests with clear pending status, not as completed transfers. Never label a request paid until an actual settlement reference is recorded.
