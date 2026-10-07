import { prisma } from "../../core/prisma";

type ShareAccess = { id: string; mode: "owner" | "trusted-contact" | "public" };

function publicBaseUrl() {
  // Prefer the explicitly configured public origin. The production API origin is
  // a safe fallback so share links never point to a local/E2E-only URL.
  const configured = process.env.TRIP_SHARE_PUBLIC_BASE_URL?.trim();
  const fallback = "https://hello-turist-backend-223677684112.asia-south2.run.app";
  return (configured || fallback).replace(/\/$/, "");
}

function whatsappPhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

async function loadSharedTrip(sharedTripId: string) {
  const shared = await prisma.sharedTrip.findUnique({ where: { id: sharedTripId } });
  if (!shared) throw new Error("SHARED_TRIP_NOT_FOUND");
  if (shared.revokedAt || shared.expiresAt <= new Date()) throw new Error("SHARED_TRIP_EXPIRED");

  const ride = await prisma.ride.findUnique({
    where: { id: shared.rideId },
    select: {
      id: true, riderId: true, status: true,
      pickupAddress: true, pickupLatitude: true, pickupLongitude: true,
      dropoffAddress: true, dropoffLatitude: true, dropoffLongitude: true,
      assignments: {
        where: { status: "ACCEPTED" },
        orderBy: { acceptedAt: "desc" },
        take: 1,
        select: {
          driverId: true,
          driver: {
            select: {
              id: true, name: true, phone: true,
              driverProfile: {
                select: {
                  profileImageKey: true,
                  vehicles: {
                    where: { isActive: true },
                    orderBy: { updatedAt: "desc" },
                    take: 1,
                    select: { make: true, model: true, registrationNumber: true, vehicleType: true, color: true },
                  },
                },
              },
            },
          },
        },
      },
      locations: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { latitude: true, longitude: true, accuracy: true, recordedAt: true },
      },
    },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");

  const contact = await prisma.trustedContact.findUnique({
    where: { id: shared.contactId },
    select: { id: true, ownerId: true, inviteeUserId: true, name: true, phone: true, consentStatus: true },
  });
  if (!contact) throw new Error("TRUSTED_CONTACT_NOT_FOUND");

  const assignment = ride.assignments[0];
  const driver = assignment?.driver;
  const vehicle = driver?.driverProfile?.vehicles[0];
  const apiBase = publicBaseUrl();
  const shareUrl = `${apiBase}/api/v1/public/trips/shared/${shared.id}`;
  const message = [
    "Hello Kurukshetra live trip",
    `Route: ${ride.pickupAddress} → ${ride.dropoffAddress}`,
    `Live trip: ${shareUrl}`,
    `Expires: ${shared.expiresAt.toISOString()}`,
  ].filter(Boolean).join("\n");

  return {
    sharedTripId: shared.id,
    expiresAt: shared.expiresAt,
    ride: {
      id: ride.id,
      status: ride.status,
      pickup: { address: ride.pickupAddress, latitude: Number(ride.pickupLatitude), longitude: Number(ride.pickupLongitude) },
      dropoff: { address: ride.dropoffAddress, latitude: Number(ride.dropoffLatitude), longitude: Number(ride.dropoffLongitude) },
    },
    driver: driver ? {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      profileImageKey: driver.driverProfile?.profileImageKey ?? null,
    } : null,
    vehicle: vehicle ? {
      make: vehicle.make, model: vehicle.model, registrationNumber: vehicle.registrationNumber,
      vehicleType: vehicle.vehicleType, color: vehicle.color ?? null,
    } : null,
    location: ride.locations[0] ? {
      latitude: Number(ride.locations[0].latitude),
      longitude: Number(ride.locations[0].longitude),
      accuracy: ride.locations[0].accuracy == null ? null : Number(ride.locations[0].accuracy),
      recordedAt: ride.locations[0].recordedAt,
    } : null,
    shareUrl,
    whatsappUrl: `https://wa.me/${whatsappPhone(contact.phone)}?text=${encodeURIComponent(message)}`,
  };
}

export async function getSharedTripForOwner(userId: string, rideId: string, sharedTripId: string) {
  const shared = await prisma.sharedTrip.findUnique({ where: { id: sharedTripId }, select: { contactId: true, rideId: true } });
  if (!shared || shared.rideId !== rideId) throw new Error("SHARED_TRIP_NOT_FOUND");
  const contact = await prisma.trustedContact.findUnique({ where: { id: shared.contactId }, select: { ownerId: true } });
  if (!contact || contact.ownerId !== userId) throw new Error("FORBIDDEN");
  return loadSharedTrip(sharedTripId);
}

export async function getSharedTripForContact(userId: string, sharedTripId: string) {
  const shared = await prisma.sharedTrip.findUnique({ where: { id: sharedTripId }, select: { contactId: true } });
  if (!shared) throw new Error("SHARED_TRIP_NOT_FOUND");
  const contact = await prisma.trustedContact.findUnique({ where: { id: shared.contactId }, select: { inviteeUserId: true, consentStatus: true } });
  if (!contact || contact.inviteeUserId !== userId || contact.consentStatus !== "ACCEPTED") throw new Error("FORBIDDEN");
  return loadSharedTrip(sharedTripId);
}

export async function getPublicSharedTrip(sharedTripId: string) {
  return loadSharedTrip(sharedTripId);
}
