# API Specification

Base path: `/api/v1`

## Standard response envelope
```json
{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "uuid"
}
```

## Auth
- POST `/auth/otp/request`
- POST `/auth/otp/verify`
- POST `/auth/google`
- POST `/auth/refresh`
- POST `/auth/logout`
- POST `/auth/logout-all`
- DELETE `/auth/account`

## Users/Roles
- GET `/users/me`
- PATCH `/users/me`
- GET `/users/me/roles`
- POST `/users/me/roles`
- PATCH `/users/me/roles/:role`

## Verification
- POST `/verification/requests`
- GET `/verification/requests/:id`
- POST `/verification/requests/:id/documents`
- POST `/verification/requests/:id/live-session`
- POST `/verification/requests/:id/resubmit`

## Rides
- POST `/rides/quote`
- POST `/rides`
- GET `/rides/:id`
- POST `/rides/:id/cancel`
- POST `/rides/:id/arriving`
- POST `/rides/:id/arrived`
- POST `/rides/:id/start`
- POST `/rides/:id/complete`
- POST `/rides/:id/interrupt`
- POST `/rides/:id/recover`
- GET `/rides/:id/events`
- GET `/rides/history`

### Ride booking: destinations and vehicle selection
`POST /rides` accepts:
- `destinations`: optional array of up to 8 intermediate stops; each stop contains `name`, optional `address`, `latitude`, and `longitude`.
- `vehicleType`: `CAR`, `SUV`, `SEDAN`, `HATCHBACK`, `VAN`, `BUS`, or `OTHER`. Defaults to `CAR`.
- `serviceType`: `RIDE_ONLY`, `GUIDE_ONLY`, or `RIDE_AND_GUIDE`
- `purpose`: optional rider-selected trip purpose
- `paymentMethod`: `RAZORPAY`, `UPI`, `CARD`, `CASH`, or `WALLET`

`POST /rides/quote` and `POST /rides/fare-quote` accept the same pickup/dropoff coordinates plus `destinations` and `vehicleType`. Fare calculation routes every leg in order (pickup → stop 1 → ... → stop N → dropoff), sums distance/duration, and applies the selected vehicle's base fare, per-km rate, and minimum fare.

The admin ride-pricing setting supports `vehicleRates` for each vehicle type while preserving the legacy `baseFare`, `perKm`, and `minimumFare` fallback.

### Driver vehicle selection
Driver vehicle APIs:
- POST `/providers/driver/vehicles`
- GET `/providers/driver/vehicles`
- PATCH `/providers/driver/vehicles/:id`
- DELETE `/providers/driver/vehicles/:id`

Automatic and manual ride dispatch only assigns a driver who has an active vehicle matching the rider-selected `vehicleType`.

### Recovery
- `interrupt` is authenticated and allowed for the rider, current assigned driver, or admin while the ride is `IN_PROGRESS`.
- `recover` is authenticated and allowed for the rider, current assigned driver, or admin while the ride is `INTERRUPTED`.
- Recovery reuses the existing dispatch assignment model, selects an approved/available replacement driver when one is not explicitly supplied, and returns the ride to `ASSIGNED` with an `OFFERED` replacement assignment.
- Recovery accepts an optional `idempotencyKey` to make repeated recovery requests safe.

## Dispatch
- GET `/rides/:id/assignments`
- POST `/rides/:id/guide-search`
- GET `/rides/:id/guide-assignments`
- POST `/rides/:id/guide-assignments`
- POST `/rides/:id/guide-assignments/:assignmentId/accept`
- POST `/rides/:id/guide-assignments/:assignmentId/reject`
- POST `/rides/:id/assignments/:assignmentId/accept`
- POST `/rides/:id/assignments/:assignmentId/reject`

Guide assignments are available only for `GUIDE_ONLY` and `RIDE_AND_GUIDE` services and require server-side guide verification and availability.

## Maps/Search
- GET `/places/autocomplete`
- GET `/places/details`
- POST `/routes/estimate`

## Payments
- POST `/payments/orders`
- POST `/payments/:id/verify`
- POST `/payments/:id/refund`
- POST `/webhooks/razorpay`

## Safety
- GET `/safety`
- POST `/emergency/incidents`
- GET `/emergency/incidents/:id`
- POST `/emergency/incidents/:id/acknowledge`
- POST `/emergency/incidents/:id/escalate`
- POST `/emergency/incidents/:id/resolve`
- POST `/rides/:id/heartbeat`

## Trusted contacts
- GET `/trusted-contacts`
- POST `/trusted-contacts/invitations`
- POST `/trusted-contacts/invitations/:id/accept`
- DELETE `/trusted-contacts/:id`
- POST `/trips/:id/share`

## Admin
Admin endpoints are under `/admin` and require explicit permissions:
`users.read`, `users.manage`, `drivers.verify`, `guides.verify`, `rides.manage`, `payments.refund`, `emergency.manage`, `notifications.manage`, `settings.manage`, etc.

## API rules
- Validate all request bodies.
- Return stable machine-readable error codes.
- Use cursor pagination for large operational lists.
- Require an `Idempotency-Key` HTTP header for booking, payment, guide-assignment, trusted-contact, emergency and recording mutations protected by the server middleware. Reusing a key with different request data is rejected.
- Enforce authorization server-side on every endpoint.
- Never return more location precision or personal data than necessary.

## Language APIs
- GET `/languages`
- GET `/languages/recommended`
- GET `/users/me/language`
- PATCH `/users/me/language`
- GET `/users/me/spoken-language-preferences`
- PATCH `/users/me/spoken-language-preferences`
- GET `/providers/:id/languages`

Recommendations may use coarse region when available; they must never silently change the account preference.
