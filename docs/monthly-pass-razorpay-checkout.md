# Razorpay route-based monthly pass

The cash monthly pass is tied to one selected pickup and destination for one month and includes exactly 30 rides on that route. The server calculates the current normal one-way fare using the same `calculateFare()` logic as ride pricing, then charges that fare multiplied by 30. Android displays a quote for convenience, but the server recalculates the final amount at order creation; client-supplied prices are never accepted.

## Configuration

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in the deployment secret/environment configuration. Keep all credentials server-side. The route quote uses the existing ride pricing configuration and Google route adapter. If fare calculation is unavailable, pass checkout fails rather than guessing a price.

## API

All endpoints require the normal bearer token.

1. `POST /api/v1/wallet/monthly-pass/razorpay/order` accepts `pickupAddress`, `pickupLatitude`, `pickupLongitude`, `dropoffAddress`, `dropoffLatitude`, and `dropoffLongitude`. It returns a server-priced Razorpay order with the normal fare, 30 included rides, and total amount in paise.
2. Launch Razorpay Checkout in Android with that order.
3. `POST /api/v1/wallet/monthly-pass/razorpay/verify` with `razorpayOrderId`, `razorpayPaymentId`, and `razorpaySignature` verifies the signature and confirms the payment directly with Razorpay before activating the pass.
4. The signed webhook can also activate a pass if the app closes during checkout. Activation is idempotent.
5. On a standard ride booking, the backend matches the selected pickup/destination to an active pass and atomically consumes one remaining ride. The ride keeps its normal fare amount for provider settlement, while the rider checkout is skipped for a pass-covered ride. Route matching allows a small coordinate tolerance for place-provider coordinate rounding.

Ad rewards remain separate and do not discount the pass. The legacy wallet-coin pass purchase is separate from this route-specific cash pass.

## Database and release

Migration `20261014090000_add_wallet_pass_payments` creates the payment ledger. Migration `20261014130000_add_route_monthly_pass_entitlements` stores route coordinates and the 30-ride entitlement on payments and activated passes. Apply migrations only through the normal release process after CI passes; do not deploy this draft to production yet.

## Safety

- Never trust a fare or amount supplied by Android.
- Never activate from the Checkout success callback alone; verify with the backend or signed webhook.
- Pass consumption and ride creation happen in the same database transaction, preventing concurrent bookings from using the same final ride twice.
- Do not merge or deploy until backend QA and Android build/tests pass.
