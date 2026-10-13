# Support contact API and admin management

## Public support contact

The public endpoint is `GET /api/v1/support/contact`.

Active contacts in the `support_team_contacts` database table take precedence over
`ADMIN_SUPPORT_PHONE`. The response exposes the primary active contact as
`data.phone` for backwards compatibility and includes `data.contacts` with active
team contacts (`id`, `name`, `phone`, `isPrimary`). The API also returns
`smsEnabled`, `callEnabled`, and `manualVerificationAvailable` as `true`.

If no active database contacts exist, a valid `ADMIN_SUPPORT_PHONE` E.164 value is
used as a legacy fallback. If neither source is configured, the endpoint returns
HTTP 503 with `SUPPORT_CONTACT_NOT_CONFIGURED`. The endpoint never invents a
phone number or exposes SMS gateway credentials.

Android clients should open the user's SMS composer or dialer only after an
explicit user action. These actions do not send a message silently and never
mark a phone number verified automatically.

## Admin contact management

All endpoints require an authenticated admin session and the relevant RBAC
permission. They are mounted under `/api/v1/admin`.

- `GET /support/contacts` — list active and inactive support contacts
  (requires `support.read`).
- `POST /support/contacts` — add a contact with `name`, `phone` in E.164
  format, and optional `isPrimary` (requires `support.manage`).
- `PATCH /support/contacts/:id` — edit `name` / `phone`, toggle `isActive`,
  or select `isPrimary` (requires `support.manage`).

Disabling is a soft change; records are not deleted. Phone numbers must be unique.
At most one active contact can be primary. If the current primary is disabled,
the service selects the oldest remaining active contact as primary. Mutations are
rate-limited and written to the audit log.

The schema change is delivered by the Prisma migration
`20261014090000_add_support_team_contacts`. Deploy the backend and apply the
migration with `npx prisma migrate deploy` before using the new admin screen.

## Manual phone verification

The support contact is only a way for the user to reach the team. An authorized
admin must separately confirm identity and use
`POST /api/v1/admin/users/:userId/phone-verification` with method `SMS` or
`CALL`. That endpoint currently applies only to an existing ACTIVE user with a
phone number on their account. Contacting support alone never changes the
verification status.
