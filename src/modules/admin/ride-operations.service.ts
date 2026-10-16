import { prisma } from "../../core/prisma";
import { assignRide } from "../ride/ride.service";
import { searchAndOfferGuide } from "../ride/guide-assignment.service";
import { interruptRide, recoverRide } from "../recovery/recovery.service";
import { writeAuditLog } from "./audit.service";

export async function listOperationalRides(input: { page: number; limit: number; status?: string; search?: string }) {
  const where: any = {};
  if (input.status) where.status = input.status as any;
  if (input.search) where.OR = [
    { id: { contains: input.search, mode: "insensitive" } },
    { pickupAddress: { contains: input.search, mode: "insensitive" } },
    { dropoffAddress: { contains: input.search, mode: "insensitive" } },
    { rider: { name: { contains: input.search, mode: "insensitive" } } },
  ];
  const [items, total] = await Promise.all([
    prisma.ride.findMany({
      where,
      include: {
        rider: { select: { id: true, name: true, username: true, email: true } },
        assignments: { orderBy: { createdAt: "desc" }, include: { driver: { select: { id: true, name: true, username: true, status: true } } } },
        guideAssignments: { orderBy: { createdAt: "desc" }, include: { guide: { select: { id: true, name: true, username: true, status: true } } } },
        payment: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.ride.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
}

export async function getOperationalRide(id: string) {
  return prisma.ride.findUnique({
    where: { id },
    include: {
      rider: { select: { id: true, name: true, username: true, email: true } },
      assignments: { orderBy: { createdAt: "desc" }, include: { driver: { select: { id: true, name: true, username: true, status: true } } } },
      guideAssignments: { orderBy: { createdAt: "desc" }, include: { guide: { select: { id: true, name: true, username: true, status: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      locations: { orderBy: { recordedAt: "desc" }, take: 20 },
      payment: { include: { refunds: true } },
    },
  });
}

export async function assignOperationalRide(adminUserId: string, rideId: string, driverId: string) {
  return assignRide(adminUserId, rideId, { driverId });
}

export async function assignOperationalGuide(adminUserId: string, rideId: string, guideId: string) {
  const result = await searchAndOfferGuide(adminUserId, rideId, guideId);
  await writeAuditLog({
    actorUserId: adminUserId,
    action: "RIDE_GUIDE_ASSIGNED_BY_ADMIN",
    entityType: "RIDE",
    entityId: rideId,
    metadata: { guideId, assignmentId: result.id, status: result.status },
  });
  return result;
}

export async function interruptOperationalRide(id: string, actorUserId: string, reason: string) {
  const result = await interruptRide(actorUserId, id, { reason });
  await writeAuditLog({ actorUserId, action: "RIDE_INTERRUPTED_BY_ADMIN", entityType: "RIDE", entityId: id, metadata: { reason } });
  return result;
}

export async function recoverOperationalRide(id: string, actorUserId: string, reason: string, driverId?: string, idempotencyKey?: string) {
  const result = await recoverRide(actorUserId, id, { reason, driverId, idempotencyKey });
  await writeAuditLog({ actorUserId, action: "RIDE_RECOVERY_BY_ADMIN", entityType: "RIDE", entityId: id, metadata: { reason, driverId: driverId ?? null, idempotencyKey: idempotencyKey ?? null } });
  return result;
}

export async function cancelOperationalRide(id: string, actorUserId: string, reason: string) {
  const ride = await prisma.ride.findUnique({ where: { id } });
  if (!ride) throw new Error("RIDE_NOT_FOUND");
  if (["COMPLETED", "CANCELLED"].includes(ride.status)) throw new Error("INVALID_RIDE_STATE");
  return prisma.$transaction(async tx => {
    const updated = await tx.ride.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason } });
    await tx.rideEvent.create({ data: { rideId: id, actorUserId, type: "CANCELLED", payload: { adminIntervention: true, reason } } });
    return updated;
  });
}
