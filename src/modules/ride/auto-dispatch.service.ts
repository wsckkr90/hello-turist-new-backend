import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";

const EARTH_RADIUS_KM = 6371;
const CANDIDATE_LIMIT = 50;
const OFFER_LIMIT = 1;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 6;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normaliseCity(value?: string | null) {
  return value?.trim().toLocaleLowerCase() || "";
}

/**
 * Finds one eligible driver and atomically creates a short-lived OFFERED assignment.
 * Ranking is deterministic: pickup proximity, same service city, experience, then least recently updated profile.
 * The latest RideLocation is used when a driver has a location history; drivers without a location remain eligible
 * but receive the lowest proximity component rather than being silently dropped.
 */
export async function dispatchRide(rideId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      riderId: true,
      status: true,
      serviceType: true,
      pickupLatitude: true,
      pickupLongitude: true,
    },
  });

  if (!ride || ride.serviceType === "GUIDE_ONLY" || !["REQUESTED", "SEARCHING"].includes(ride.status)) return null;

  const assignedDriverIds = new Set(
    (await prisma.rideAssignment.findMany({
      where: { rideId },
      select: { driverId: true },
    })).map((assignment) => assignment.driverId),
  );

  const busyDriverIds = new Set(
    (await prisma.rideAssignment.findMany({
      where: { status: { in: ["OFFERED", "ACCEPTED"] } },
      select: { driverId: true },
    })).map((assignment) => assignment.driverId),
  );

  const drivers = await prisma.driverProfile.findMany({
    where: {
      isAvailable: true,
      user: {
        status: "ACTIVE",
        roles: { some: { role: "DRIVER", verificationStatus: { in: ["APPROVED", "VERIFIED"] } } },
      },
    },
    select: {
      userId: true,
      serviceCity: true,
      experienceYears: true,
      updatedAt: true,
      user: { select: { name: true } },
    },
    take: CANDIDATE_LIMIT,
  });

  const candidates = drivers.filter((driver) => !assignedDriverIds.has(driver.userId) && !busyDriverIds.has(driver.userId));
  if (!candidates.length) return null;

  const locations = await prisma.rideLocation.findMany({
    where: { driverId: { in: candidates.map((candidate) => candidate.userId) } },
    orderBy: { recordedAt: "desc" },
    select: { driverId: true, latitude: true, longitude: true, recordedAt: true },
    take: candidates.length * 3,
  });
  const latestLocation = new Map<string, (typeof locations)[number]>();
  for (const location of locations) if (location.driverId && !latestLocation.has(location.driverId)) latestLocation.set(location.driverId, location);

  const pickupLat = Number(ride.pickupLatitude);
  const pickupLon = Number(ride.pickupLongitude);
  const city = normaliseCity((await prisma.ride.findUnique({ where: { id: rideId }, select: { pickupAddress: true } }))?.pickupAddress);

  const ranked = candidates.map((driver) => {
    const location = latestLocation.get(driver.userId);
    const distanceKm = location ? haversineKm(pickupLat, pickupLon, Number(location.latitude), Number(location.longitude)) : null;
    const cityMatch = city && normaliseCity(driver.serviceCity) && city.includes(normaliseCity(driver.serviceCity)) ? 1 : 0;
    const proximityScore = distanceKm === null ? 0 : Math.max(0, 100 - Math.min(distanceKm, 100));
    const experienceScore = Math.min(100, Math.max(0, driver.experienceYears ?? 0) * 10);
    const score = proximityScore * 0.6 + cityMatch * 20 + experienceScore * 0.1 + (driver.updatedAt.getTime() / 1e13);
    return { driver, distanceKm, score };
  }).sort((a, b) => b.score - a.score);

  for (const candidate of ranked.slice(0, OFFER_LIMIT)) {
    try {
      let assignment: { id: string } | null = null;
      for (let transactionAttempt = 1; transactionAttempt <= 4 && !assignment; transactionAttempt += 1) {
        try {
          assignment = await prisma.$transaction(async (tx) => {
            const currentRide = await tx.ride.findUnique({ where: { id: rideId }, select: { status: true } });
            if (!currentRide || !["REQUESTED", "SEARCHING"].includes(currentRide.status)) return null;

            const active = await tx.rideAssignment.findFirst({
              where: { driverId: candidate.driver.userId, status: { in: ["OFFERED", "ACCEPTED"] } },
              select: { id: true },
            });
            if (active) return null;

            const created = await tx.rideAssignment.create({
              data: { rideId, driverId: candidate.driver.userId, status: "OFFERED" },
            });
            await tx.ride.update({ where: { id: rideId }, data: { status: "ASSIGNED" } });
            await tx.rideEvent.create({
              data: {
                rideId,
                type: "DRIVER_ASSIGNED",
                payload: {
                  driverId: candidate.driver.userId,
                  assignmentId: created.id,
                  dispatch: "AUTOMATIC",
                  distanceKm: candidate.distanceKm,
                  score: Number(candidate.score.toFixed(4)),
                },
              },
            });
            return created;
          }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });
        } catch (error) {
          const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "";
          if (code !== "P2034" || transactionAttempt === 4) throw error;
          const delay = 100 * 2 ** (transactionAttempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (assignment) {
        void notifyUser(candidate.driver.userId, "New ride offer", "You have a new ride offer. Please accept or reject it before it expires.", {
          rideId,
          assignmentId: assignment.id,
          status: "OFFERED",
          expiresInMs: Number(process.env.DISPATCH_OFFER_TIMEOUT_MS || 60_000),
        }).catch(() => undefined);
        void notifyUser(ride.riderId, "Driver search started", "We found an available driver and sent a ride offer.", {
          rideId,
          assignmentId: assignment.id,
          status: "ASSIGNED",
        }).catch(() => undefined);
        return assignment;
      }
    } catch (error) {
      console.error("Automatic dispatch candidate reservation failed", candidate.driver.userId, error);
    }
  }

  return null;
}

export function scheduleRideRetry(rideId: string, attempt: number) {
  if (attempt > MAX_RETRY_ATTEMPTS) return null;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attempt - 1, 4)));
  setTimeout(() => {
    void dispatchRide(rideId).then((assignment) => {
      if (!assignment) scheduleRideRetry(rideId, attempt + 1);
    }).catch((error) => {
      console.error("Automatic dispatch retry failed", rideId, error);
      scheduleRideRetry(rideId, attempt + 1);
    });
  }, delay);
  return delay;
}
