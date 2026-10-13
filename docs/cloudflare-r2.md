# Cloudflare R2 private media storage

The media upload URL endpoint supports an opt-in R2 provider. Cloudinary remains the default.

Set these server environment variables to enable R2:
- `STORAGE_PROVIDER=r2`
- `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
- `R2_BUCKET=<private-bucket-name>`
- `R2_ACCESS_KEY_ID=<R2 access key>`
- `R2_SECRET_ACCESS_KEY=<R2 secret key>`

Never commit credentials. The API issues short-lived (5 minute) signed PUT URLs and keeps credentials server-side. Keep the bucket private and configure lifecycle rules for retention. The caller must PUT the bytes to the returned URL with the returned content type.

This switches the generic media upload URL endpoint only. Ride recording lifecycle endpoints still use the current Cloudinary-specific implementation and must be migrated separately before setting R2 as the provider for ride recordings.
