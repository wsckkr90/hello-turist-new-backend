# Razorpay monthly pass checkout

This flow is separate from wallet-coin redemption and ride payments.

## Server configuration

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `MONTHLY_PASS_PRICE_INR` in the deployment secret/environment configuration. `MONTHLY_PASS_PRICE_INR` is the approved monthly pass price in whole INR rupees. The API intentionally returns 503 when the price is missing rather than silently charging a guessed amount.

Configure the existing Razorpay webhook URL `/api/v1/webhooks/razorpay` for `payment.captured` and `payment.failed`. Webhook signature verification and event de-duplication are handled by the existing payment webhook controller.

## API

All endpoints require the normal bearer token.

1. `POST /api/v1/wallet/monthly-pass/razorpay/order` creates a server-priced Razorpay order. Response includes `keyId`, `orderId`, `amount` (paise), `currency`, and `passMonths`.
2. Launch Razorpay Checkout in the Android app with that order.
3. `POST /api/v1/wallet/monthly-pass/razorpay/verify` with `razorpayOrderId`, `razorpayPaymentId`, and `razorpaySignature` verifies the signature and checks the payment against Razorpay before activating the pass.
4. The verified webhook can also activate a pass when the app closes before returning from Checkout. Activation is idempotent; repeated webhook/verification events do not create another pass.

The legacy `POST /api/v1/wallet/monthly-pass/purchase` continues to buy a pass with wallet coins and is intentionally not repurposed for cash payments.

## Database

Migration `20261014090000_add_wallet_pass_payments` adds an order ledger for provider status, amount, user, and idempotency. Apply migrations through the project's normal migration release process; do not run production migration commands until this PR is reviewed and CI passes.

## Safety notes

- Never trust an amount supplied by Android.
- Never activate on a Checkout success callback alone; use the verify endpoint or signed webhook.
- Keep Razorpay secrets server-side.
- This API enables the backend checkout flow. Android must still launch the native Razorpay Checkout SDK and call these endpoints to expose the feature to users.
