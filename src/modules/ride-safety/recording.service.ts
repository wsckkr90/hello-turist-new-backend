import { randomUUID } from "node:crypto";
import { prisma } from "../../core/prisma";
import { createCloudinaryPublicId, getCloudinary, signCloudinaryUpload } from "../../core/cloudinary";
import { RIDE_RECORDING_POLICY } from "./ride-safety.policy";
import { getRideSafetyRecordingPolicy, type RideSafetyRecordingPolicy } from "./recording-policy.service";
const CLOUDINARY_RESOURCE_TYPE = "video" as const;
const CLOUDINARY_DELIVERY_TYPE = "authenticated" as const;

async function assertActiveRideAccess(userId: string, rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { assignments: true, guideAssignments: true } });
  if (!ride) throw new Error("RIDE_NOT_FOUND");
  const isRider = ride.riderId === userId;
  const isAcceptedDriver = ride.assignments.some((a) => a.driverId === userId && a.status === "ACCEPTED");
  const isAcceptedGuide = ride.guideAssignments.some((a) => a.guideId === userId && a.status === "ACCEPTED");
  if (!isRider && !isAcceptedDriver && !isAcceptedGuide) throw new Error("RIDE_ACCESS_DENIED");
  if (!RIDE_RECORDING_POLICY.recordingOnlyWhileRideActive || !["ASSIGNED", "DRIVER_ARRIVING", "IN_PROGRESS"].includes(ride.status)) {
    throw new Error("RECORDING_ONLY_DURING_ACTIVE_RIDE");
  }
  return ride;
}

async function assertConsent(rideId: string, policy: RideSafetyRecordingPolicy) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      riderId: true,
      assignments: { where: { status: "ACCEPTED" }, select: { driverId: true } },
      guideAssignments: { where: { status: "ACCEPTED" }, select: { guideId: true } },
    },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");

  const events = await prisma.rideEvent.findMany({
    where: { rideId, type: "RECORDING_CONSENT", payload: { path: ["consent"], equals: true } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { actorUserId: true },
  });
  const consentedUserIds = new Set(events.map((event) => event.actorUserId).filter((id): id is string => Boolean(id)));

  if (policy.riderConsentRequired && !consentedUserIds.has(ride.riderId)) {
    throw new Error("RECORDING_RIDER_CONSENT_REQUIRED");
  }

  if (policy.providerAcknowledgementRequired) {
    const providerIds = [
      ...ride.assignments.map((assignment) => assignment.driverId),
      ...ride.guideAssignments.map((assignment) => assignment.guideId),
    ];
    if (providerIds.length === 0 || providerIds.some((providerId) => !consentedUserIds.has(providerId))) {
      throw new Error("RECORDING_PROVIDER_ACKNOWLEDGEMENT_REQUIRED");
    }
  }
}

function normalizeMedia(contentType: string) {
  if (contentType === "video/mp4") return "VIDEO" as const;
  if (contentType === "audio/m4a") return "AUDIO" as const;
  throw new Error("RECORDING_MEDIA_NOT_SUPPORTED");
}

function normalizeFormat(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "audio/m4a") return "m4a";
  throw new Error("RECORDING_MEDIA_NOT_SUPPORTED");
}

function assertRecordingPublicId(rideId: string, publicId: string) {
  if (!publicId.startsWith(`private/ride-recording/${rideId}/`)) throw new Error("RECORDING_KEY_INVALID");
}

export async function prepareRideRecordingUpload(userId: string, rideId: string, contentType: string) {
  const policy = await getRideSafetyRecordingPolicy();
  if (!policy.enabled) throw new Error("RECORDING_DISABLED_BY_POLICY");
  await assertActiveRideAccess(userId, rideId);
  await assertConsent(rideId, policy);
  const media = normalizeMedia(contentType);
  const publicId = createCloudinaryPublicId(rideId, media, randomUUID());
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = {
    public_id: publicId,
    resource_type: CLOUDINARY_RESOURCE_TYPE,
    type: CLOUDINARY_DELIVERY_TYPE,
    timestamp,
  };
  const signed = signCloudinaryUpload(signedParams);
  const expiresAt = new Date(Date.now() + policy.retentionDays * 86400000).toISOString();

  return {
    key: publicId,
    publicId,
    contentType,
    media,
    uploadUrl: `https://api.cloudinary.com/v1_1/${signed.cloudName}/${CLOUDINARY_RESOURCE_TYPE}/upload`,
    uploadParams: {
      ...signedParams,
      api_key: signed.apiKey,
      signature: signed.signature,
    },
    expiresAt,
  };
}

export async function finalizeRideRecording(userId: string, rideId: string, publicId: string, contentType: string, bytes?: number) {
  const policy = await getRideSafetyRecordingPolicy();
  if (!policy.enabled) throw new Error("RECORDING_DISABLED_BY_POLICY");
  await assertActiveRideAccess(userId, rideId);
  await assertConsent(rideId, policy);
  assertRecordingPublicId(rideId, publicId);

  const client = getCloudinary();
  const resource = await client.api.resource(publicId, {
    resource_type: CLOUDINARY_RESOURCE_TYPE,
    type: CLOUDINARY_DELIVERY_TYPE,
  });
  const expectedFormat = normalizeFormat(contentType);
  if (resource.resource_type !== CLOUDINARY_RESOURCE_TYPE || resource.format !== expectedFormat) {
    throw new Error("RECORDING_CONTENT_TYPE_MISMATCH");
  }

  const expiresAt = new Date(Date.now() + policy.retentionDays * 86400000).toISOString();
  const event = await prisma.rideEvent.create({
    data: {
      rideId,
      actorUserId: userId,
      type: "LOCATION_RECORDED",
      payload: {
        kind: "RECORDING_UPLOADED",
        key: publicId,
        publicId,
        contentType,
        media: normalizeMedia(contentType),
        bytes: bytes ?? resource.bytes ?? null,
        expiresAt,
        storage: "CLOUDINARY",
      },
    },
  });
  return {
    recordingId: event.id,
    key: publicId,
    publicId,
    contentType,
    bytes: resource.bytes ?? bytes ?? null,
    expiresAt,
  };
}

export async function createRecordingAccessUrl(userId: string, rideId: string, recordingEventId: string) {
  await assertActiveRideAccess(userId, rideId);
  const event = await prisma.rideEvent.findFirst({ where: { id: recordingEventId, rideId, type: "LOCATION_RECORDED" } });
  const payload = (event?.payload ?? {}) as { kind?: string; key?: string; publicId?: string; expiresAt?: string; media?: "VIDEO" | "AUDIO" };
  const publicId = payload.publicId ?? payload.key;
  if (!event || payload.kind !== "RECORDING_UPLOADED" || !publicId) throw new Error("RECORDING_NOT_FOUND");
  assertRecordingPublicId(rideId, publicId);
  if (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now()) throw new Error("RECORDING_EXPIRED");

  const client = getCloudinary();
  const format = payload.media === "AUDIO" ? "m4a" : "mp4";
  const url = client.url(publicId, {
    resource_type: CLOUDINARY_RESOURCE_TYPE,
    type: CLOUDINARY_DELIVERY_TYPE,
    secure: true,
    sign_url: true,
    format,
  });

  await prisma.rideEvent.create({
    data: {
      rideId,
      actorUserId: userId,
      type: "LOCATION_RECORDED",
      payload: { kind: "RECORDING_ACCESSED", recordingEventId },
    },
  });
  return url;
}

export async function purgeExpiredRideRecordings() {
  const policy = await getRideSafetyRecordingPolicy();
  const cutoff = new Date(Date.now() - policy.retentionDays * 86400000);
  const events = await prisma.rideEvent.findMany({
    where: { type: "LOCATION_RECORDED", createdAt: { lt: cutoff } },
    select: { id: true, rideId: true, payload: true },
  });
  let deleted = 0;
  const client = getCloudinary();

  for (const event of events) {
    const payload = (event.payload ?? {}) as { kind?: string; key?: string; publicId?: string };
    const publicId = payload.publicId ?? payload.key;
    if (payload.kind !== "RECORDING_UPLOADED" || !publicId) continue;
    if (!publicId.startsWith(`private/ride-recording/${event.rideId}/`)) continue;

    try {
      const result = await client.uploader.destroy(publicId, {
        resource_type: CLOUDINARY_RESOURCE_TYPE,
        type: CLOUDINARY_DELIVERY_TYPE,
        invalidate: true,
      });
      if (result.result !== "ok" && result.result !== "not found") continue;
    } catch {
      continue;
    }

    await prisma.rideEvent.create({
      data: {
        rideId: event.rideId,
        type: "LOCATION_RECORDED",
        payload: { kind: "RECORDING_DELETED", recordingEventId: event.id, reason: "RETENTION_EXPIRED" },
      },
    });
    deleted += 1;
  }
  return deleted;
}
