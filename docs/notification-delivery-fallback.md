# Notification delivery fallback

The notification service always persists an in-app notification before attempting FCM. FCM delivery now retries transient HTTP/network failures up to three times per device. Invalid/unregistered tokens are disabled.

## Optional SMS fallback for driver offers

Configure these backend environment variables to enable the SMS fallback:

- `SMS_GATEWAY_BASE_URL`: reachable gateway base URL, for example `http://10.0.0.20:8080` on a private network, without trailing slash.
- `SMS_GATEWAY_API_KEY`: the gateway API key.

When all FCM device sends fail (or there are no enabled device tokens), the backend attempts SMS only for time-sensitive driver offers whose notification data contains `status: "OFFERED"` and a `rideId`. Other notifications never trigger SMS. The gateway must be reachable from the backend; do not expose an unauthenticated HTTP gateway publicly. Use a private network/VPN or HTTPS reverse proxy in production.

The gateway endpoint is `POST /api/send` with `X-API-Key` and JSON fields `phone_number`, `message`, and `request_id`. SMS is best effort: gateway acceptance does not prove handset delivery.

## Important limits

- FCM HTTP success means Firebase accepted the message, not that the phone displayed it or the driver saw it.
- The database/in-app inbox and ride-assignment status remain the source of truth.
- Configure gateway credentials only in the VPS environment; never commit real keys.
- Test with a dedicated test driver and a non-production gateway/number before enabling this in production.
