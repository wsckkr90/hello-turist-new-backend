import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";
import { scheduleRideRetry } from "./auto-dispatch.service";

const intervalMs = Math.max(15_000, Number(process.env.DISPATCH_MONITOR_INTERVAL_MS || 15_000));
const offerTimeoutMs = Math.max(30_000, Number(process.env.DISPATCH_OFFER_TIMEOUT_MS || 60_000));

/**
 * Expires stale driver/guide offers without requiring a client request.
 * The update is conditional so a concurrent accept/reject wins safely.
 */
async function expireStaleOffers() {
  const cutoff = new Date(Date.now() - offerTimeoutMs);
  const [driverOffers, guideOffers] = await Promise.all([
    prisma.rideAssignment.findMany({
      where: { status: "OFFERED", assignedAt: { lt: cutoff } },
      select: { id: true, rideId: true, driverId: true },
      take: 200,
    }),
    prisma.guideAssignment.findMany({
      where: { status: "OFFERED", assignedAt: { lt: cutoff } },
      select: { id: true, rideId: true, guideId: true },
      take: 200,
    }),
  ]);

  for (const offer of driverOffers) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.rideAssignment.updateMany({
        where: { id: offer.id, status: "OFFERED", assignedAt: { lt: cutoff } },
        data: { status: "EXPIRED" as never },
      });
      if (updated.count !== 1) return;

      const ride = await tx.ride.findUnique({ where: { id: offer.rideId }, select: { riderId: true, status: true } });
      await tx.rideEvent.create({
        data: {
          rideId: offer.rideId,
          type: "DRIVER_REJECTED",
          payload: { assignmentId: offer.id, driverId: offer.driverId, reason: "OFFER_EXPIRED" },
        },
      });

      if (ride && ride.status === "ASSIGNED") {
        const remaining = await tx.rideAssignment.count({ where: { rideId: offer.rideId, status: { in: ["OFFERED", "ACCEPTED"] } } });
        if (remaining === 0) await tx.ride.update({ where: { id: offer.rideId }, data: { status: "SEARCHING" } });
      }
    }).then(async () => {
      scheduleRideRetry(offer.rideId, 1);
      void notifyUser(offer.driverId, "Ride offer expired", "This ride offer expired because it was not accepted in time.", { rideId: offer.rideId, assignmentId: offer.id, status: "EXPIRED" }).catch(() => undefined);
      const ride = await prisma.ride.findUnique({ where: { id: offer.rideId }, select: { riderId: true, status: true } });
      if (ride && ride.status === "SEARCHING") {
        void notifyUser(ride.riderId, "Searching for a driver", "The previous driver offer expired. We are searching for another driver.", { rideId: offer.rideId, status: "SEARCHING" }).catch(() => undefined);
      }
    }).catch((error) => console.error("Driver offer expiry failed", offer.id, error));
  }

  for (const offer of guideOffers) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.guideAssignment.updateMany({
        where: { id: offer.id, status: "OFFERED", assignedAt: { lt: cutoff } },
        data: { status: "EXPIRED" as never },
      });
      if (updated.count !== 1) return;
      await tx.rideEvent.create({
        data: {
          rideId: offer.rideId,
          type: "DRIVER_REJECTED",
          payload: { role: "GUIDE", assignmentId: offer.id, guideId: offer.guideId, reason: "OFFER_EXPIRED" },
        },
      });
    }).then(() => {
      void notifyUser(offer.guideId, "Guide offer expired", "This guide offer expired because it was not accepted in time.", { rideId: offer.rideId, assignmentId: offer.id, status: "EXPIRED" }).catch(() => undefined);
    }).catch((error) => console.error("Guide offer expiry failed", offer.id, error));
  }
}

export function startDispatchMonitoringWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireStaleOffers();
    } catch (error) {
      console.error("Dispatch monitor failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), intervalMs);
}
