import { prisma } from "../../core/prisma";
import { rideRecordingConsentSchema, type RideRecordingConsentInput } from "./ride-safety.schema";
import { RIDE_RECORDING_POLICY } from "./ride-safety.policy";
import { getRideSafetyRecordingPolicy } from "./recording-policy.service";

export async function recordConsent(userId: string, input: RideRecordingConsentInput) {
  const parsed = rideRecordingConsentSchema.parse(input);
  const policy = await getRideSafetyRecordingPolicy();
  if (!policy.enabled) throw new Error("RECORDING_DISABLED_BY_POLICY");

  const ride = await prisma.ride.findUnique({
    where: { id: parsed.rideId },
    include: { assignments: true, guideAssignments: true },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");

  const isRider = ride.riderId === userId;
  const isAcceptedDriver = ride.assignments.some((assignment) => assignment.driverId === userId && assignment.status === "ACCEPTED");
  const isAcceptedGuide = ride.guideAssignments.some((assignment) => assignment.guideId === userId && assignment.status === "ACCEPTED");
  if (!isRider && !isAcceptedDriver && !isAcceptedGuide) throw new Error("RIDE_ACCESS_DENIED");

  if (!parsed.media.every((media) => RIDE_RECORDING_POLICY.supportedMedia.includes(media))) {
    throw new Error("RECORDING_MEDIA_NOT_SUPPORTED");
  }

  const consenterRole = isRider ? "RIDER" : isAcceptedDriver ? "DRIVER" : "GUIDE";
  await prisma.rideEvent.create({
    data: {
      rideId: parsed.rideId,
      actorUserId: userId,
      type: "RECORDING_CONSENT",
      payload: { consent: true, media: parsed.media, consenterRole },
    },
  });
  return { rideId: parsed.rideId, consented: true, media: parsed.media, consenterRole };
}
