# Public support contact API

The public support-contact endpoint is `GET /api/v1/support/contact`.

Configure `ADMIN_SUPPORT_PHONE` in the backend runtime environment using a verified public support number in E.164 format (for example, `+91...`). The repository's `.env.example` intentionally leaves this value blank; do not copy a personal or unverified number into production configuration.

- Returns HTTP 200 with `data.phone`, `data.smsEnabled`, and `data.callEnabled` when a valid number is configured.
- Returns HTTP 503 with `SUPPORT_CONTACT_NOT_CONFIGURED` if the value is missing or invalid.
- The endpoint never returns a made-up fallback number or any SMS gateway API key.
- Android clients should use the returned number to open the device's default dialer or SMS composer with an explicit user action. It does not send a message silently.

## Cloud Run configuration

To expose this contact in production, set the GitHub repository variable `ADMIN_SUPPORT_PHONE` to the approved public support phone number in E.164 format. The deployment workflow passes this variable to Cloud Run. If it is empty or invalid, the endpoint intentionally responds with HTTP 503; no demo or personal phone number is supplied by default.


## OTP fallback: manual team verification

When a valid `ADMIN_SUPPORT_PHONE` is configured, the response also includes
`manualVerificationAvailable: true`. Android can show **Send SMS** and **Call team**
after an OTP attempt. These actions open the user's own messaging app or dialer;
the backend does not send SMS, start calls, or mark the phone verified automatically.

An admin must confirm the user's identity and then use the protected
`POST /api/v1/admin/users/:userId/phone-verification` endpoint with method
`SMS` or `CALL`. That endpoint currently applies only to an existing ACTIVE user
with a phone number on their account. Contacting support alone never changes the
verification status.
