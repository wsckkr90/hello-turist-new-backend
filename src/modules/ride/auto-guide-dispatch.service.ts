import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 6;

function normaliseCity(value?: string | null) {
  return value?.trim().toLocaleLowerCase() || "";
}

/** Offer an eligible guide to a GUIDE_ONLY or RIDE_AND_GUIDE ride. */
export async function dispatchGuide(rideId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, riderId: true, status: true, serviceType: true, pickupAddress: true },
  });
  if (!ride || ride.serviceType === "RIDE_ONLY" || ["COMPLETED", "CANCELLED", "IN_PROGRESS", "NEAR_DESTINATION"].includes(ride.status)) return null;

  const existing = await prisma.guideAssignment.findFirst({
    where: { rideId, status: { in: ["OFFERED", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const [busyRows, triedRows] = await Promise.all([
    prisma.guideAssignment.findMany({
      where: { status: { in: ["OFFERED", "ACCEPTED"] } },
      select: { guideId: true },
    }),
    prisma.guideAssignment.findMany({ where: { rideId }, select: { guideId: true } }),
  ]);
  const busyGuideIds = new Set(busyRows.map((assignment) => assignment.guideId));
  const triedGuideIds = new Set(triedRows.map((assignment) => assignment.guideId));

  const guides = await prisma.guideProfile.findMany({
    where: {
      isAvailable: true,
      user: {
        status: "ACTIVE",
        roles: { some: { role: "GUIDE", verificationStatus: "APPROVED" } },
      },
    },
    select: { userId: true, serviceCity: true, updatedAt: true },
    take: 50,
    orderBy: { updatedAt: "desc" },
  });
  const pickup = normaliseCity(ride.pickupAddress);
  const candidates = guides
    .filter((guide) => !busyGuideIds.has(guide.userId) && !triedGuideIds.has(guide.userId))
    .sort((a, b) => {
      const aMatch = pickup && normaliseCity(a.serviceCity) && pickup.includes(normaliseCity(a.serviceCity)) ? 1 : 0;
      const bMatch = pickup && normaliseCity(b.serviceCity) && pickup.includes(normaliseCity(b.serviceCity)) ? 1 : 0;
      return bMatch - aMatch || b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  for (const candidate of candidates) {
    try {
      const assignment = await prisma.$transaction(async (tx) => {
        const currentRide = await tx.ride.findUnique({
          where: { id: rideId },
          select: { id: true, riderId: true, serviceType: true, status: true },
        });
        if (!currentRide || currentRide.serviceType === "RIDE_ONLY" ||
          ["COMPLETED", "CANCELLED", "IN_PROGRESS", "NEAR_DESTINATION"].includes(currentRide.status)) return null;

        const currentAssignment = await tx.guideAssignment.findFirst({
          where: { rideId, status: { in: ["OFFERED", "ACCEPTED"] } },
          select: { id: true },
        });
        if (currentAssignment) return null;

        const busy = await tx.guideAssignment.findFirst({
          where: { guideId: candidate.userId, status: { in: ["OFFERED", "ACCEPTED"] } },
          select: { id: true },
        });
        if (busy) return null;

        const existingPair = await tx.guideAssignment.findUnique({
          where: { rideId_guideId: { rideId, guideId: candidate.userId } },
          select: { id: true, status: true },
        });
        const offered = existingPair
          ? await tx.guideAssignment.update({
              where: { id: existingPair.id },
              data: { status: "OFFERED", assignedAt: new Date(), acceptedAt: null, rejectedAt: null, updatedAt: new Date() },
            })
          : await tx.guideAssignment.create({
              data: { rideId, guideId: candidate.userId, status: "OFFERED", updatedAt: new Date() },
            });

        await tx.rideEvent.create({
          data: {
            rideId,
            type: "DRIVER_ASSIGNED",
            payload: { role: "GUIDE", guideId: candidate.userId, assignmentId: offered.id, dispatch: "AUTOMATIC" },
          },
        });
        return offered;
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });

      if (!assignment) return null;
      void notifyUser(candidate.userId, "New guide assignment", "A trip needs a guide. Please accept or reject this offer.", {
        destination: "RIDE", notification_type: "RIDE", rideId, assignmentId: assignment.id, status: "OFFERED",
      }).catch(() => undefined);
      void notifyUser(ride.riderId, "Guide assignment offered", "We found a guide for your trip. Waiting for the guide to respond.", {
        destination: "RIDE", notification_type: "RIDE", rideId, guideId: candidate.userId, assignmentId: assignment.id, status: "OFFERED",
      }).catch(() => undefined);
      return assignment;
    } catch (error) {
      console.error("Automatic guide dispatch candidate reservation failed", candidate.userId, error);
    }
  }
  return null;
}

export function scheduleGuideRetry(rideId: string, attempt: number) {
  if (attempt > MAX_RETRY_ATTEMPTS) return null;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attempt - 1, 4)));
  setTimeout(() => {
    void dispatchGuide(rideId).then((assignment) => {
      if (!assignment) scheduleGuideRetry(rideId, attempt + 1);
    }).catch((error) => {
      console.error("Automatic guide dispatch retry failed", rideId, error);
      scheduleGuideRetry(rideId, attempt + 1);
    });
  }, delay);
  return delay;
}
