# Admin live ride monitoring API

GET /api/v1/admin/live-operations requires an authenticated admin with rides.read.

Returns up to 500 rides in active operational states, rider/accepted driver/accepted guide assignment details, the latest recorded ride location, and recent lifecycle events. Location freshness is computed against RIDE_HEARTBEAT_STALE_MS (default 120 seconds), with explicit LIVE, STALE, or NO_LOCATION values. Response is marked Cache-Control: no-store because it contains sensitive location information.

This endpoint reports status only from location updates already being sent by Android clients. It does not manufacture a live location when permissions are denied, the device is offline, or the app is not sending updates. It is an active-ride monitor, not a directory of every unassigned user's location. UI polling/WebSocket updates and field-device end-to-end tests are still required before production readiness.
