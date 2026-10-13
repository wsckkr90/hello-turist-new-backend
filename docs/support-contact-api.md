# Public support contact API

The public support-contact endpoint is `GET /api/v1/support/contact`.

Configure `ADMIN_SUPPORT_PHONE` in the backend runtime environment using a verified public support number in E.164 format (for example, `+91...`). The repository's `.env.example` intentionally leaves this value blank; do not copy a personal or unverified number into production configuration.

- Returns HTTP 200 with `data.phone`, `data.smsEnabled`, and `data.callEnabled` when a valid number is configured.
- Returns HTTP 503 with `SUPPORT_CONTACT_NOT_CONFIGURED` if the value is missing or invalid.
- The endpoint never returns a made-up fallback number or any SMS gateway API key.
- Android clients should use the returned number to open the device's default dialer or SMS composer with an explicit user action. It does not send a message silently.
