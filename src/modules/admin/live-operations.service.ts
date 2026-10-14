import { prisma } from "../../core/prisma";

const ACTIVE_RIDE_STATUSES = ["ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS", "NEAR_DESTINATION", "INTERRUPTED"] as const;
const liveWindowMs = Math.max(30_000, Number(process.env.RIDE_HEARTBEAT_STALE_MS || 120_000));

export async function getAdminLiveRideMonitoring() {
  const rides = await prisma.ride.findMany({
    where: { status: { in: [...ACTIVE_RIDE_STATUSES] as any } },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true, status: true, riderId: true, pickupAddress: true, dropoffAddress: true,
      createdAt: true, updatedAt: true,
      rider: { select: { id: true, name: true, username: true } },
      assignments: {
        where: { status: "ACCEPTED" },
        orderBy: { acceptedAt: "desc" },
        take: 1,
        select: { status: true, acceptedAt: true, driver: { select: { id: true, name: true, username: true } } },
      },
      guideAssignments: {
        where: { status: "ACCEPTED" },
        orderBy: { acceptedAt: "desc" },
        take: 1,
        select: { status: true, acceptedAt: true, guide: { select: { id: true, name: true, username: true } } },
      },
      locations: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { driverId: true, guideId: true, latitude: true, longitude: true, accuracy: true, recordedAt: true },
      },
      events: {
        where: { type: { in: ["DRIVER_ACCEPTED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "RIDE_STARTED", "RIDE_COMPLETED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { type: true, createdAt: true },
      },
    },
  });
  const now = Date.now();
  return {
    generatedAt: new Date(now).toISOString(),
    liveWindowMs,
    rides: rides.map(ride => {
      const location = ride.locations[0];
      const lastLocationAt = location?.recordedAt ?? null;
      const ageMs = lastLocationAt ? Math.max(0, now - lastLocationAt.getTime()) : null;
      return {
        rideId: ride.id,
        status: ride.status,
        rider: ride.rider,
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        createdAt: ride.createdAt,
        updatedAt: ride.updatedAt,
        driver: ride.assignments[0]?.driver ?? null,
        driverAssignmentAcceptedAt: ride.assignments[0]?.acceptedAt ?? null,
        guide: ride.guideAssignments[0]?.guide ?? null,
        guideAssignmentAcceptedAt: ride.guideAssignments[0]?.acceptedAt ?? null,
        location: location ? {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracyMeters: location.accuracy === null ? null : Number(location.accuracy),
          recordedAt: location.recordedAt,
          ageMs,
          freshness: ageMs !== null && ageMs <= liveWindowMs ? "LIVE" : "STALE",
        } : { latitude: null, longitude: null, accuracyMeters: null, recordedAt: null, ageMs: null, freshness: "NO_LOCATION" },
        lifecycle: ride.events,
      };
    }),
    counts: {
      activeRides: rides.length,
      liveLocations: rides.filter(r => r.locations[0] && now - r.locations[0].recordedAt.getTime() <= liveWindowMs).length,
      staleOrMissingLocations: rides.filter(r => !r.locations[0] || now - r.locations[0].recordedAt.getTime() > liveWindowMs).length,
    },
  };
}
