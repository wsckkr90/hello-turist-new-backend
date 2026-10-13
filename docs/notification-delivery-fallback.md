# Notification delivery fallback

The notification service saves an in-app notification before attempting FCM. FCM delivery retries transient HTTP/network failures up to three attempts per device. Invalid/unregistered tokens are disabled.

## SMS fallback using SMS-Gateway-Free + Tailscale

This integration matches [SMS-Gateway-Free](https://github.com/mdakashhossain1/SMS-Gateway-Free), which exposes `POST /api/send`, uses the `X-API-Key` header, and defaults to port `8080`.

Configure these environment variables on the backend VPS:

- `SMS_GATEWAY_BASE_URL=http://<SMS_PHONE_TAILSCALE_IP>:8080`
- `SMS_GATEWAY_API_KEY=<the API key shown in the SMS Gateway app>`

Replace the placeholder with the Android phone's **Tailscale IPv4 address** (usually in the `100.x.y.z` range) and the configured app port. Do not include `/api/send` in the base URL and do not add a trailing slash. Example format only: `http://100.x.y.z:8080`.

### Network setup checklist

1. Install/sign in to Tailscale on both the Android phone running SMS-Gateway-Free and the backend VPS.
2. In the Android app, grant SMS permissions and start/enable its API server. Confirm its port (default `8080`) and copy the API key.
3. In Tailscale, find the Android phone's Tailscale IPv4 address. Use that address—not its Wi-Fi/LAN IP—in `SMS_GATEWAY_BASE_URL`.
4. Confirm the VPS is signed in to the same tailnet and can reach the phone on the configured port. Check the Android phone's Tailscale connection and app foreground-service/server status if the connection fails.
5. Keep the gateway private to the tailnet. Do not create a public port-forward or expose port 8080 to the internet. HTTP is acceptable only over the trusted private tailnet; use HTTPS if exposing it through a public/reverse-proxy endpoint.
6. Set the two environment variables in the backend's actual runtime environment (systemd, Docker Compose, or process manager), then restart the backend process so it reads them.

### API request used by the backend

The backend sends:

- Method/path: `POST /api/send`
- Header: `X-API-Key: <configured API key>`
- JSON: `{ "phone_number": "+91XXXXXXXXXX", "message": "...", "request_id": "ride-offer-<rideId>-<userId>" }`

The gateway documentation says `request_id` is optional; it is supplied to help correlate requests.

When all FCM device sends fail (or no enabled device token exists), the backend attempts SMS only for time-sensitive driver-offer notifications whose data contains `status: "OFFERED"` and a `rideId`. Other notifications do not trigger SMS. SMS is best effort: a gateway response does not necessarily prove the handset received the message.

## Testing

From the VPS, test reachability without putting the API key in shell history or sharing it in chat:

```bash
curl --connect-timeout 3 --max-time 8 -sS -o /tmp/sms-gateway-test.json -w 'HTTP %{http_code}\n' \
  -X POST "$SMS_GATEWAY_BASE_URL/api/send" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SMS_GATEWAY_API_KEY" \
  -d '{"phone_number":"+91YOUR_TEST_NUMBER","message":"Hello Kurukshetra SMS gateway test"}'
```

Use a test number and inspect the app's SMS history/status. Avoid running a test against a real customer number.

## Important limits

- FCM HTTP success means Firebase accepted the message, not that the phone displayed it or the driver saw it.
- The database/in-app inbox and ride-assignment status remain the source of truth.
- Keep the gateway API key only in the VPS runtime environment; never commit real keys.
- SMS fallback is not yet a substitute for driver acknowledgement, durable delivery receipts, or admin escalation.
