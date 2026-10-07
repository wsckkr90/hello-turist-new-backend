import crypto from "node:crypto";
import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";

async function requireApprovedGuide(userId: string) {
  const role = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "GUIDE" } },
    select: { verificationStatus: true },
  });
  if (!role || role.verificationStatus !== "APPROVED") throw new Error("GUIDE_NOT_VERIFIED");
}

async function requireRideMember(userId: string, rideId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, riderId: true, serviceType: true, status: true, assignments: { select: { driverId: true, status: true } } },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");
  const admin = await prisma.userRoleAssignment.findUnique({ where: { userId_role: { userId, role: "ADMIN" } }, select: { id: true } });
  if (!admin && ride.riderId !== userId && !ride.assignments.some((a) => a.driverId === userId && ["OFFERED", "ACCEPTED"].includes(a.status))) throw new Error("RIDE_ACCESS_DENIED");
  return ride;
}

export async function searchAndOfferGuide(userId: string, rideId: string, guideId: string) {
  const ride = await requireRideMember(userId, rideId);
  if (ride.serviceType === "RIDE_ONLY") throw new Error("GUIDE_NOT_REQUIRED");
  const guideRole = await prisma.userRoleAssignment.findUnique({ where: { userId_role: { userId: guideId, role: "GUIDE" } }, select: { verificationStatus: true } });
  const guide = await prisma.guideProfile.findUnique({ where: { userId: guideId }, select: { id: true, isAvailable: true } });
  if (!guideRole || guideRole.verificationStatus !== "APPROVED" || !guide || !guide.isAvailable) throw new Error("GUIDE_NOT_AVAILABLE");
  const assignment = await prisma.$transaction(async (tx) => {
    const existing = await tx.guideAssignment.findUnique({ where: { rideId_guideId: { rideId, guideId } }, select: { id: true, status: true } });
    if (existing && existing.status !== "REJECTED" && existing.status !== "EXPIRED") throw new Error("GUIDE_ASSIGNMENT_EXISTS");
    const a = existing
      ? await tx.guideAssignment.update({ where: { id: existing.id }, data: { status: "OFFERED", assignedAt: new Date(), acceptedAt: null, rejectedAt: null } })
      : await tx.guideAssignment.create({ data: { id: crypto.randomUUID(), rideId, guideId, status: "OFFERED", updatedAt: new Date() } });
    await tx.rideEvent.create({ data: { rideId, actorUserId: userId, type: "DRIVER_ASSIGNED", payload: { role: "GUIDE", guideId, assignmentId: a.id } } });
    return a;
  });
  void notifyUser(guideId, "New guide assignment", "You have a new guide assignment. Please accept or reject it.", { rideId, assignmentId: assignment.id, status: assignment.status }).catch(() => undefined);
  void notifyUser(ride.riderId, "Guide assigned", "A guide has been offered for your trip.", { rideId, guideId, status: assignment.status }).catch(() => undefined);
  return assignment;
}

export async function listGuideAssignments(userId: string, rideId: string) {
  await requireRideMember(userId, rideId);
  return prisma.guideAssignment.findMany({
    where: { rideId },
    orderBy: { createdAt: "desc" },
    include: { guide: { select: { id: true, name: true, username: true, guideProfile: true } } },
  });
}

export async function acceptGuideAssignment(userId: string, rideId: string, assignmentId: string) {
  await requireApprovedGuide(userId);
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { id: true, riderId: true, serviceType: true, status: true } });
  if (!ride) throw new Error("RIDE_NOT_FOUND");
  if (!["GUIDE_ONLY", "RIDE_AND_GUIDE"].includes(ride.serviceType)) throw new Error("GUIDE_NOT_REQUIRED");
  const assignment = await prisma.guideAssignment.findUnique({ where: { id: assignmentId }, select: { id: true, rideId: true, guideId: true, status: true } });
  if (!assignment || assignment.rideId !== rideId) throw new Error("GUIDE_ASSIGNMENT_NOT_FOUND");
  if (assignment.guideId !== userId) throw new Error("ASSIGNMENT_ACCESS_DENIED");
  if (assignment.status !== "OFFERED") throw new Error("INVALID_ASSIGNMENT_STATE");
  const result = await prisma.$transaction(async (tx) => {
    if (["GUIDE_ONLY", "RIDE_AND_GUIDE"].includes(ride.serviceType)) { const acceptedGuide = await tx.guideAssignment.findFirst({ where: { rideId, status: "ACCEPTED", id: { not: assignmentId } }, select: { id: true } }); if (acceptedGuide) throw new Error("RIDE_ALREADY_HAS_GUIDE"); } const updated = await tx.guideAssignment.updateMany({ where: { id: assignmentId, rideId, guideId: userId, status: "OFFERED" }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    if (updated.count !== 1) throw new Error("INVALID_ASSIGNMENT_STATE");
    if (ride.serviceType === "GUIDE_ONLY") await tx.ride.update({ where: { id: rideId }, data: { status: "ASSIGNED" } });
    await tx.rideEvent.create({ data: { rideId, actorUserId: userId, type: "DRIVER_ACCEPTED", payload: { role: "GUIDE", assignmentId } } });
    return tx.guideAssignment.findUnique({ where: { id: assignmentId } });
  }, { isolationLevel: "Serializable" });
  void notifyUser(ride.riderId, "Guide accepted", "Your guide accepted the trip.", { rideId, assignmentId, status: result?.status }).catch(() => undefined);
  return result;
}

export async function rejectGuideAssignment(userId: string, rideId: string, assignmentId: string) {
  await requireApprovedGuide(userId);
  const assignment = await prisma.guideAssignment.findUnique({ where: { id: assignmentId }, select: { id: true, rideId: true, guideId: true, status: true } });
  if (!assignment || assignment.rideId !== rideId) throw new Error("GUIDE_ASSIGNMENT_NOT_FOUND");
  if (assignment.guideId !== userId) throw new Error("ASSIGNMENT_ACCESS_DENIED");
  if (assignment.status !== "OFFERED") throw new Error("INVALID_ASSIGNMENT_STATE");
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.guideAssignment.updateMany({ where: { id: assignmentId, rideId, guideId: userId, status: "OFFERED" }, data: { status: "REJECTED", rejectedAt: new Date() } });
    if (updated.count !== 1) throw new Error("INVALID_ASSIGNMENT_STATE");
    await tx.rideEvent.create({ data: { rideId, actorUserId: userId, type: "DRIVER_REJECTED", payload: { role: "GUIDE", assignmentId } } });
    return tx.guideAssignment.findUnique({ where: { id: assignmentId } });
  });
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { riderId: true } });
  if (ride) void notifyUser(ride.riderId, "Guide declined", "The selected guide declined the trip.", { rideId, assignmentId, status: result?.status }).catch(() => undefined);
  return result;
}


export async function listMyGuideAssignments(userId: string) {
  await requireApprovedGuide(userId);

  return prisma.guideAssignment.findMany({
    where: {
      guideId: userId,
      status: { in: ["OFFERED", "ACCEPTED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      ride: {
        select: {
          id: true,
          pickupAddress: true,
          pickupLatitude: true,
          pickupLongitude: true,
          dropoffAddress: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
          serviceType: true,
          purpose: true,
          paymentMethod: true,
          scheduledAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}
