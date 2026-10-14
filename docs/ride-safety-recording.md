# Ride safety audio/video recording

## Purpose
Audio/video recording is a safety feature for active rides. It is not a general-purpose background recorder.

## Consent and mandatory roles
- The rider must see a clear recording disclosure and explicitly grant recording consent before an active ride can start when recording is enabled by policy.
- Drivers and guides must have recording permission enabled and acknowledged as a mandatory safety requirement before they can accept/start rides.
- The application must never silently record. Camera and microphone runtime permissions must be requested by Android at the point of use.
- If required permission or consent is absent, the ride-start flow must stop and explain what is required.

## Recording lifecycle
1. Before ride start, show purpose, media types (audio/video), who can access recordings, retention, and safety-use terms.
2. Request camera/microphone runtime permissions as applicable.
3. Record only while the ride is active.
4. Show an always-visible recording indicator while recording.
5. Allow the rider to see that recording is active; do not provide a hidden/background mode.
6. Stop recording automatically when the ride ends or is cancelled.
7. Upload recordings directly to Cloudinary using a short-lived backend-generated signed upload request.
8. Store only the Cloudinary public ID/reference in the application database; recordings use Cloudinary's authenticated delivery type.

## Recording policy controls
- `GET /api/v1/safety/recording-policy` exposes the current policy to authenticated mobile clients.
- Admins with `emergency.read` can view `GET /api/v1/admin/safety/recording`; admins with `emergency.manage` can update it with `PUT /api/v1/admin/safety/recording`.
- The policy is stored in `app_settings` under `RIDE_SAFETY_RECORDING_POLICY`, and policy updates are audit logged.
- Recording uploads are disabled by default. An admin must deliberately enable the server-side policy after the mobile recording lifecycle is deployed.
- Retention is configurable from 1–365 days; rider consent and acknowledgement from every accepted driver/guide are hard safety requirements and cannot be disabled.

## Backend recording API
- `POST /api/v1/rides/:id/recording-consent` records explicit consent from the rider or an accepted driver/guide.
- `POST /api/v1/rides/:id/recordings/upload-url` validates ride access and consent, then returns a short-lived Cloudinary signed upload request for `video/mp4` or `audio/m4a`.
- The mobile client uploads the file directly to Cloudinary using the returned `uploadUrl` and `uploadParams`.
- `POST /api/v1/rides/:id/recordings/complete` verifies that the authenticated Cloudinary asset exists and matches the requested media type before recording the database event.
- `GET /api/v1/rides/:id/recordings/:recordingId/access` validates ride access and returns a signed Cloudinary delivery URL.
- Expired recording events are processed by the existing safety retention worker and deleted from Cloudinary.

## Security
- Cloudinary API secrets stay on the backend and are never returned to the mobile client.
- Recordings are uploaded with `type=authenticated`; unauthenticated/public delivery is not used.
- Store only private object references in the application database; do not expose public media URLs.
- Restrict access to authorized safety/support workflows and audit access.
- Encrypt media in transit and use Cloudinary authenticated media delivery for protected assets.
- Apply a configurable, bounded retention period and delete expired media.
- Validate ride membership/role server-side for every recording operation.
- Verify the actual Cloudinary asset during finalize; never treat a client-provided recording-success flag as authoritative.

## Terms & Conditions
By enabling ride recording, the user acknowledges that audio/video may be captured during the active ride for safety, incident investigation, and support purposes. Recording is limited to the active ride, protected access is used, and retention is limited according to the configured safety-retention policy. Required permissions and consent must be granted before recording starts. Where recording is mandatory for a driver or guide, that provider cannot start/accept the ride until the required permission and acknowledgement are complete.

## Storage configuration
Set these production variables:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RIDE_RECORDING_RETENTION_DAYS=30
```

Cloudinary is now the backend media-storage provider; the previous R2 variables are no longer required for production media/ride recordings.

## Implementation status
Backend policy persistence, consent validation (including accepted guide acknowledgements), authenticated Cloudinary signed uploads, upload verification, signed access URLs, and retention deletion are implemented. Recordings are stored in private Cloudinary storage when the backend upload flow is used; they are not currently guaranteed to remain only on the user's phone. Android camera/microphone runtime permission UI and the client-side recording lifecycle still need to be wired to these endpoints before the mobile feature is represented as fully production-ready. Keep the server-side recording switch disabled until those client safeguards ship.
