import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { signCloudinaryUpload } from "../../core/cloudinary";
import { getR2StorageConfig } from "../../core/storage";

export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4", "audio/m4a"] as const;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

function resourceType(contentType: string) {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "raw";
  return "video";
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "general";
}

export function preparePrivateMediaUpload(input: { userId: string; contentType: string; size: number; purpose: string }) {
  if (!ALLOWED_MEDIA_TYPES.includes(input.contentType as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    throw new Error("Unsupported media type");
  }
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_MEDIA_BYTES) {
    throw new Error("Invalid media size");
  }
  const publicId = `private/${input.userId}/${safeSegment(input.purpose)}/${randomUUID()}`;
  return { key: publicId, publicId, contentType: input.contentType, size: input.size };
}

/** Uses private Cloudflare R2 objects when STORAGE_PROVIDER=r2; credentials stay server-side. */
export async function createPrivateMediaUploadUrl(input: { userId: string; contentType: string; size: number; purpose: string }) {
  const media = preparePrivateMediaUpload(input);
  if ((process.env.STORAGE_PROVIDER ?? "cloudinary").toLowerCase() === "r2") {
    const config = getR2StorageConfig();
    if (!config.accessKeyId || !config.secretAccessKey) throw new Error("R2_STORAGE_CREDENTIALS_MISSING");
    const client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: media.key,
      ContentType: media.contentType,
      Metadata: { owner: input.userId, purpose: safeSegment(input.purpose) },
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    return { ...media, storage: "R2", uploadUrl, method: "PUT", expiresInSeconds: 300 };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const type = input.purpose.startsWith("profile_avatar") ? ("upload" as const) : ("authenticated" as const);
  const resource_type = resourceType(media.contentType);
  const signed = signCloudinaryUpload({ public_id: media.publicId, type, timestamp });
  return {
    ...media,
    storage: "CLOUDINARY",
    uploadUrl: `https://api.cloudinary.com/v1_1/${signed.cloudName}/${resource_type}/upload`,
    uploadParams: {
      public_id: media.publicId,
      resource_type,
      type,
      timestamp,
      api_key: signed.apiKey,
      signature: signed.signature,
    },
  };
}
