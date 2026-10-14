# Admin private verification document access

## Endpoint

\`GET /api/v1/admin/verification/requests/:id/documents/:documentId/access\`

Requires an authenticated admin session and either the existing \`drivers.verify\` or \`guides.verify\` permission used by the verification review routes.

## Security behavior

- The document must belong to the verification request in the URL.
- The stored object key must be inside that request owner's \`private/:userId/provider_verification/\` folder.
- Cloudflare R2 objects are checked with a HEAD request before a five-minute presigned GET URL is generated.
- Cloudinary authenticated assets are queried by resource type and opened through a five-minute signed private-download URL.
- Responses set \`Cache-Control: no-store\`; the URL expiry is returned explicitly.
- Successful document-link creation writes \`VERIFICATION_DOCUMENT_ACCESSED\` to the audit log. The signed URL and storage key are not stored in audit metadata.
- Admin verification list/detail/decision responses now return only document review metadata, not \`privateObjectKey\`.

## Deployment checks

Verify that \`STORAGE_PROVIDER\` matches the private object storage currently in use and that the corresponding Cloudinary or R2 credentials are set on the backend. This endpoint does not make an object public. If a document exists in the database but was never uploaded, access generation fails closed. Browser access is temporary and remains subject to backend authentication for URL generation.
