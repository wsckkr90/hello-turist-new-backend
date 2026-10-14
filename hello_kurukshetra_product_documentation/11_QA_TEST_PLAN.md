# QA and Test Plan

## Test layers
1. Static analysis/lint
2. Unit tests
3. Integration tests
4. API contract tests
5. Database migration tests
6. Android UI tests
7. Admin UI tests
8. Realtime tests
9. Payment webhook tests
10. Security tests
11. Load/performance tests
12. End-to-end tests

## Critical scenarios
### Auth
OTP success/failure/rate-limit, Google auth, expired refresh token, logout-all.

### Verification
Document upload, invalid file, expired document, rejection, resubmission, live verification, permission checks.

### Booking
Quote, confirmation, duplicate request, no driver/guide supply, automatic driver and guide offer, guide rejection and reassignment, 10-second urgent-call fallback, cancellation.

### Trip
Arriving, arrived, start, progress, completion, GPS loss, network loss, reconnect and process death.

### Interrupted ride
Freeze state, compute completed segment, replacement assignment, transparent fare adjustment, no double charge.

### Guide
Pickup discovery, destination discovery, filters, availability and independent assignment.

### Payments
Success, failure, delayed webhook, duplicate webhook, refund, partial refund, cash.

### Emergency
SOS, duplicate SOS prevention, acknowledgement, responder assignment, escalation, arrival, resolution, audit.

### Safety heartbeat
GPS unavailable, network unavailable, backgrounded app, force-stop and device-off limitations.

### Security
Unauthorized role access, IDOR, privilege escalation, malicious upload, rate-limit bypass, webhook spoofing, token reuse.

## Release criteria
Zero open critical/high security defects, critical E2E paths passing, payment reconciliation validated, emergency workflows simulated, acceptable crash-free rate and performance budgets met.
## Localization tests
Test signup language selection, device-locale detection, regional recommendations, persistence, manual changes, notification localization, missing-translation fallback, spoken-language matching, RTL readiness and offline behavior. Verify location recommendations never override explicit language.
