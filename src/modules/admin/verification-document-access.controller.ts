import type { Request, Response } from "express";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../../core/prisma";
import { getCloudinary } from "../../core/cloudinary";
import { getR2StorageConfig } from "../../core/storage";
import { writeAuditLog } from "./audit.service";

const ACCESS_TTL_SECONDS = 300;

async function makeR2DownloadUrl(key: string) {
  const config = getR2StorageConfig();
  if (!config.accessKeyId || !config.secretAccessKey) throw new Error("R2_STORAGE_CREDENTIALS_MISSING");
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentType: head.ContentType || "application/octet-stream",
    ResponseContentDisposition: "inline; filename=\"verification-document\"",
  });
  return {
    url: await getSignedUrl(client, command, { expiresIn: ACCESS_TTL_SECONDS }),
    contentType: head.ContentType || null,
  };
}

async function makeCloudinaryDownloadUrl(key: string) {
  const cloudinary = getCloudinary();
  let resourceType: "image" | "raw" = "image";
  let resource: { format?: string; resource_type?: string; bytes?: number };
  try {
    resource = await cloudinary.api.resource(key, { resource_type: "image", type: "authenticated" });
  } catch {
    resourceType = "raw";
    resource = await cloudinary.api.resource(key, { resource_type: "raw", type: "authenticated" });
  }
  const format = resource.format || (resourceType === "raw" ? "pdf" : "jpg");
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;
  const url = cloudinary.utils.private_download_url(key, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: expiresAt,
    attachment: false,
  });
  return {
    url,
    contentType: resourceType === "raw" ? "application/pdf" : "image/" + format,
  };
}

/**
 * Create a short-lived link only after checking that the document belongs to
 * the requested verification record and is stored under that provider's
 * private verification prefix. Never return storage keys to the admin client.
 */
export async function getAdminVerificationDocumentAccessController(req: Request, res: Response) {
  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  const documentId = typeof req.params.documentId === "string" ? req.params.documentId : "";
  if (!requestId || !documentId) {
    return res.status(400).json({
      success: false, data: null,
      error: { code: "INVALID_DOCUMENT_REQUEST", message: "Verification and document IDs are required" },
      requestId: req.requestId,
    });
  }

  try {
    const document = await prisma.verificationDocument.findFirst({
      where: { id: documentId, verificationRequestId: requestId },
      select: {
        id: true, documentType: true, privateObjectKey: true,
        verificationRequest: { select: { id: true, userId: true } },
      },
    });
    if (!document) {
      return res.status(404).json({
        success: false, data: null,
        error: { code: "VERIFICATION_DOCUMENT_NOT_FOUND", message: "Verification document not found" },
        requestId: req.requestId,
      });
    }

    const requiredPrefix = "private/" + document.verificationRequest.userId + "/provider_verification/";
    if (!document.privateObjectKey.startsWith(requiredPrefix)) {
      return res.status(404).json({
        success: false, data: null,
        error: { code: "VERIFICATION_DOCUMENT_NOT_FOUND", message: "Verification document not found" },
        requestId: req.requestId,
      });
    }

    const storage = (process.env.STORAGE_PROVIDER ?? "cloudinary").toLowerCase();
    const access = storage === "r2"
      ? await makeR2DownloadUrl(document.privateObjectKey)
      : await makeCloudinaryDownloadUrl(document.privateObjectKey);
    const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString();

    await writeAuditLog({
      actorUserId: req.user!.id,
      action: "VERIFICATION_DOCUMENT_ACCESSED",
      entityType: "VERIFICATION_DOCUMENT",
      entityId: document.id,
      metadata: { verificationRequestId: requestId, documentType: document.documentType, expiresAt },
      requestId: req.requestId,
    });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    return res.status(200).json({
      success: true,
      data: { url: access.url, expiresAt, expiresInSeconds: ACCESS_TTL_SECONDS, contentType: access.contentType },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOCUMENT_ACCESS_FAILED";
    const unavailable = ["CLOUDINARY_STORAGE_NOT_CONFIGURED", "R2_STORAGE_NOT_CONFIGURED", "R2_STORAGE_CREDENTIALS_MISSING"].includes(code);
    console.error("ADMIN_VERIFICATION_DOCUMENT_ACCESS_FAILED", code);
    return res.status(unavailable ? 503 : 502).json({
      success: false, data: null,
      error: {
        code: unavailable ? "DOCUMENT_STORAGE_NOT_CONFIGURED" : "DOCUMENT_ACCESS_FAILED",
        message: unavailable ? "Private document storage is not configured" : "Unable to create temporary document access",
      },
      requestId: req.requestId,
    });
  }
}
