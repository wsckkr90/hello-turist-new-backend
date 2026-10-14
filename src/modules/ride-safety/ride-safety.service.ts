import { prisma } from "../../core/prisma";
import { rideRecordingConsentSchema, type RideRecordingConsentInput } from "./ride-safety.schema";
import { RIDE_RECORDING_POLICY } from "./ride-safety.policy";

export async function recordConsent(userId: string, input: RideRecordingConsentInput) {
  const parsed = rideRecordingConsentSchema.parse(input);
  const ride = await prisma.ride.findUnique({
    where: { id: parsed.rideId },
    include: { assignments: true, guideAssignments: true },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");

  const isRider = ride.riderId === userId;
  const acceptedDriver = ride.assignments.find((a) => a.driverId === userId && a.status === "ACCEPTED");
  const acceptedGuide = ride.guideAssignments.find((a) => a.guideId === userId && a.status === "ACCEPTED");
  if (!isRider && !acceptedDriver && !acceptedGuide) throw new Error("RIDE_ACCESS_DENIED");
  if (!RIDE_RECORDING_POLICY.supportedMedia.every((m) => parsed.media.includes(m as "VIDEO" | "AUDIO"))) {
    throw new Error("RECORDING_MEDIA_REQUIRED");
  }
  if (!["ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS", "NEAR_DESTINATION"].includes(ride.status)) {
    throw new Error("RECORDING_ONLY_DURING_ACTIVE_RIDE");
  }

  const consenterRole = isRider ? "RIDER" : "PROVIDER";
  const providerRole = acceptedGuide && !acceptedDriver ? "GUIDE" : acceptedDriver ? "DRIVER" : null;
  await prisma.rideEvent.create({
    data: {
      rideId: parsed.rideId,
      actorUserId: userId,
      type: "RECORDING_CONSENT",
      payload: { consent: true, consenterRole, providerRole, media: parsed.media },
    },
  });
  return { rideId: parsed.rideId, consented: true, consenterRole, providerRole, media: parsed.media };
}
