import { prisma } from "../../core/prisma";
import { notifyUser } from "../notification/notification.service";
import type { GuideSearchInput } from "./dispatch.schema";

const assignmentInclude = {
  driver: {
    select: {
      id: true,
      name: true,
      username: true,
      driverProfile: {
        select: {
          bio: true,
          experienceYears: true,
          serviceCity: true,
          serviceArea: true,
          profileImageKey: true,
          isAvailable: true,
          vehicles: {
            where: { isActive: true },
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              vehicleType: true,
              seatCount: true,
              color: true,
              imageKey: true,
            },
            take: 3,
          },
        },
      },
    },
  },
} as const;

async function requireRide(rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { id: true, riderId: true, status: true } });
  if (!ride) throw new Error("RIDE_NOT_FOUND");
  return ride;
}

async function requireRideMember(userId: string, rideId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, riderId: true, assignments: { select: { driverId: true, status: true } } },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");

  const admin = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "ADMIN" } },
    select: { id: true },
  });
  const member = ride.riderId === userId || ride.assignments.some((a) => a.driverId === userId && ["OFFERED", "ACCEPTED"].includes(a.status));
  if (!admin && !member) throw new Error("RIDE_ACCESS_DENIED");
}

async function requireApprovedDriver(userId: string) {
  const role = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "DRIVER" } },
    select: { verificationStatus: true },
  });
  if (!role || role.verificationStatus !== "APPROVED") throw new Error("DRIVER_NOT_VERIFIED");
}

export async function listAssignments(userId: string, rideId: string) {
  await requireRideMember(userId, rideId);
  return prisma.rideAssignment.findMany({ where: { rideId }, orderBy: { createdAt: "desc" }, include: assignmentInclude });
}

export async function searchGuides(userId: string, rideId: string, input: GuideSearchInput) {
  const ride = await requireRide(rideId);
  if (ride.riderId !== userId) {
    const admin = await prisma.userRoleAssignment.findUnique({
      where: { userId_role: { userId, role: "ADMIN" } },
      select: { id: true },
    });
    if (!admin) throw new Error("RIDE_ACCESS_DENIED");
  }

  return prisma.guideProfile.findMany({
    where: {
      isAvailable: true,
      ...(input.serviceCity ? { serviceCity: input.serviceCity } : {}),
      ...(input.languages?.length ? { languages: { hasSome: input.languages } } : {}),
      ...(input.specialties?.length ? { specialties: { hasSome: input.specialties } } : {}),
      user: {
        status: "ACTIVE",
        roles: { some: { role: "GUIDE", verificationStatus: "APPROVED" } },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: input.limit,
    select: {
      id: true,
      userId: true,
      bio: true,
      experienceYears: true,
      serviceCity: true,
      profileImageKey: true,
      languages: true,
      specialties: true,
      isAvailable: true,
      user: { select: { id: true, name: true, username: true } },
    },
  });
}

export async function acceptAssignment(userId: string, rideId: string, assignmentId: string) {
  await requireApprovedDriver(userId);
  const ride = await requireRide(rideId);
  if (ride.status !== "ASSIGNED") throw new Error("INVALID_RIDE_STATE");

  const assignment = await prisma.rideAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, rideId: true, driverId: true, status: true },
  });
  if (!assignment || assignment.rideId !== rideId) throw new Error("DRIVER_ASSIGNMENT_NOT_FOUND");
  if (assignment.driverId !== userId) throw new Error("ASSIGNMENT_ACCESS_DENIED");
  if (assignment.status !== "OFFERED") throw new Error("INVALID_ASSIGNMENT_STATE");

  const driver = await prisma.driverProfile.findUnique({ where: { userId }, select: { isAvailable: true } });
  if (!driver?.isAvailable) throw new Error("DRIVER_NOT_AVAILABLE");

  const result = await prisma.$transaction(async (tx) => {
    const accepted = await tx.rideAssignment.findFirst({ where: { rideId, status: "ACCEPTED" }, select: { id: true } });
    if (accepted) throw new Error("RIDE_ALREADY_ACCEPTED");

    const updated = await tx.rideAssignment.updateMany({
      where: { id: assignmentId, rideId, driverId: userId, status: "OFFERED" },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("INVALID_ASSIGNMENT_STATE");

    await tx.rideEvent.create({ data: { rideId, actorUserId: userId, type: "DRIVER_ACCEPTED", payload: { assignmentId } } });
    return tx.rideAssignment.findUnique({ where: { id: assignmentId }, include: assignmentInclude });
  }, { isolationLevel: "Serializable" });

  if (result) void notifyUser(ride.riderId, "Driver accepted", "Your assigned driver accepted the ride.", { rideId, assignmentId, status: "ACCEPTED" }).catch(() => undefined);
  return result;
}

export async function rejectAssignment(userId: string, rideId: string, assignmentId: string) {
  await requireApprovedDriver(userId);
  const ride = await requireRide(rideId);

  const assignment = await prisma.rideAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, rideId: true, driverId: true, status: true },
  });
  if (!assignment || assignment.rideId !== rideId) throw new Error("DRIVER_ASSIGNMENT_NOT_FOUND");
  if (assignment.driverId !== userId) throw new Error("ASSIGNMENT_ACCESS_DENIED");
  if (assignment.status !== "OFFERED") throw new Error("INVALID_ASSIGNMENT_STATE");

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.rideAssignment.updateMany({
      where: { id: assignmentId, rideId, driverId: userId, status: "OFFERED" },
      data: { status: "REJECTED", rejectedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("INVALID_ASSIGNMENT_STATE");

    const remaining = await tx.rideAssignment.count({ where: { rideId, status: { in: ["OFFERED", "ACCEPTED"] } } });
    if (remaining === 0 && ["ASSIGNED", "SEARCHING"].includes(String(ride.status))) {
      await tx.ride.update({ where: { id: rideId }, data: { status: "SEARCHING" } });
    }

    await tx.rideEvent.create({ data: { rideId, actorUserId: userId, type: "DRIVER_REJECTED", payload: { assignmentId } } });
    return tx.rideAssignment.findUnique({ where: { id: assignmentId }, include: assignmentInclude });
  });

  void notifyUser(ride.riderId, "Driver declined", "The assigned driver declined the ride. We are searching again.", { rideId, assignmentId, status: "SEARCHING" }).catch(() => undefined);
  return result;
}
