import crypto from "node:crypto";
import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";
import { scheduleGuideRetry } from "./auto-guide-dispatch.service";

async function requireApprovedGuide(userId: string) {
  const role = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "GUIDE" } },
    select: { verificationStatus: true },
  });
  if (!role || !["APPROVED", "VERIFIED"].includes(role.verificationStatus)) throw new Error("GUIDE_NOT_VERIFIED");
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
  if (!["REQUESTED", "SEARCHING", "ASSIGNED"].includes(ride.status)) {
    throw new Error("INVALID_RIDE_STATE");
  }

  const admin = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "ADMIN" } },
    select: { id: true },
  });
  if (!admin && ride.riderId !== userId) throw new Error("RIDE_ACCESS_DENIED");

  const [guideRole, guide, guideUser] = await Promise.all([
    prisma.userRoleAssignment.findUnique({
      where: { userId_role: { userId: guideId, role: "GUIDE" } },
      select: { verificationStatus: true },
    }),
    prisma.guideProfile.findUnique({
      where: { userId: guideId },
      select: { id: true, isAvailable: true },
    }),
    prisma.user.findUnique({ where: { id: guideId }, select: { status: true } }),
  ]);
  if (!guideRole || !["APPROVED", "VERIFIED"].includes(guideRole.verificationStatus) ||
      !guide || !guide.isAvailable || guideUser?.status !== "ACTIVE") {
    throw new Error("GUIDE_NOT_AVAILABLE");
  }

  const result = await prisma.$transaction(async (tx) => {
    const currentRide = await tx.ride.findUnique({
      where: { id: rideId },
      select: { id: true, riderId: true, serviceType: true, status: true },
    });
    if (!currentRide) throw new Error("RIDE_NOT_FOUND");
    if (currentRide.serviceType === "RIDE_ONLY") throw new Error("GUIDE_NOT_REQUIRED");
    if (!["REQUESTED", "SEARCHING", "ASSIGNED"].includes(currentRide.status)) {
      throw new Error("INVALID_RIDE_STATE");
    }

    const existingForSelectedGuide = await tx.guideAssignment.findUnique({
      where: { rideId_guideId: { rideId, guideId } },
      select: { id: true, status: true },
    });
    if (existingForSelectedGuide && ["OFFERED", "ACCEPTED"].includes(existingForSelectedGuide.status)) {
      throw new Error("GUIDE_ASSIGNMENT_EXISTS");
    }

    const [currentUser, currentProfile, busyElsewhere] = await Promise.all([
      tx.user.findUnique({ where: { id: guideId }, select: { status: true } }),
      tx.guideProfile.findUnique({ where: { userId: guideId }, select: { isAvailable: true } }),
      tx.guideAssignment.findFirst({
        where: { guideId, status: { in: ["OFFERED", "ACCEPTED"] }, rideId: { not: rideId } },
        select: { id: true },
      }),
    ]);
    if (currentUser?.status !== "ACTIVE" || !currentProfile?.isAvailable || busyElsewhere) {
      throw new Error("GUIDE_NOT_AVAILABLE");
    }

    const previousAssignments = await tx.guideAssignment.findMany({
      where: { rideId, status: { in: ["OFFERED", "ACCEPTED"] } },
      select: { id: true, guideId: true },
    });
    await tx.guideAssignment.updateMany({
      where: { rideId, status: { in: ["OFFERED", "ACCEPTED"] } },
      data: { status: "EXPIRED", rejectedAt: new Date() },
    });

    const assignment = existingForSelectedGuide
      ? await tx.guideAssignment.update({
          where: { id: existingForSelectedGuide.id },
          data: { status: "OFFERED", assignedAt: new Date(), acceptedAt: null, rejectedAt: null, updatedAt: new Date() },
        })
      : await tx.guideAssignment.create({
          data: { rideId, guideId, status: "OFFERED", updatedAt: new Date() },
        });

    await tx.rideEvent.create({
      data: {
        rideId,
        actorUserId: userId,
        type: "DRIVER_ASSIGNED",
        payload: {
          role: "GUIDE",
          guideId,
          assignmentId: assignment.id,
          dispatch: "ADMIN",
          replacedGuideIds: previousAssignments.map((item) => item.guideId),
        },
      },
    });
    return {
      assignment,
      previousGuideIds: [...new Set(previousAssignments.map((item) => item.guideId))],
    };
  }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });

  for (const previousGuideId of result.previousGuideIds) {
    if (previousGuideId === guideId) continue;
    void notifyUser(previousGuideId, "Guide assignment updated", "An administrator changed the guide assignment for this trip.", {
      destination: "RIDE", notification_type: "RIDE", rideId, status: "EXPIRED",
    }).catch(() => undefined);
  }
  void notifyUser(guideId, "New guide assignment", "An administrator offered you this trip. Please accept or reject it.", {
    destination: "RIDE", notification_type: "RIDE", rideId, assignmentId: result.assignment.id, status: result.assignment.status,
  }).catch(() => undefined);
  void notifyUser(ride.riderId, "Guide assigned", "A guide has been offered for your trip. The app will update when the guide responds.", {
    destination: "RIDE", notification_type: "RIDE", rideId, guideId, assignmentId: result.assignment.id, status: result.assignment.status,
  }).catch(() => undefined);
  return result.assignment;
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
  void notifyUser(ride.riderId, "Guide accepted", "Your guide accepted the trip.", { destination: "RIDE", notification_type: "RIDE", rideId, assignmentId, status: result?.status }).catch(() => undefined);
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
  if (ride) void notifyUser(ride.riderId, "Guide declined", "The selected guide declined the trip. We are searching for another available guide.", { rideId, assignmentId, status: result?.status }).catch(() => undefined);
  scheduleGuideRetry(rideId, 1);
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
