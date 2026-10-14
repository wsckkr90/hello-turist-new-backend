import { prisma } from "../../core/prisma";
import { UserRole } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import type { VehicleInput } from "./provider.schema";

const driverSelect = {
  id: true,
  userId: true,
  bio: true,
  experienceYears: true,
  serviceCity: true,
  serviceArea: true,
  profileImageKey: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
  vehicles: {
    where: { isActive: true },
    orderBy: { createdAt: "desc" as const },
  },
};

const guideSelect = {
  id: true,
  userId: true,
  bio: true,
  experienceYears: true,
  serviceCity: true,
  profileImageKey: true,
  languages: true,
  specialties: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      dateOfBirth: true,
      gender: true,
      roles: {
        where: { role: UserRole.GUIDE },
        select: { verificationStatus: true },
      },
    },
  },
} satisfies Prisma.GuideProfileSelect;

async function requireRole(userId: string, role: "DRIVER" | "GUIDE") {
  const assignment = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role } },
    select: { verificationStatus: true },
  });
  if (!assignment) throw new Error("ROLE_NOT_FOUND");
  return assignment;
}

export async function getDriverProfile(userId: string) {
  await requireRole(userId, "DRIVER");
  return prisma.driverProfile.findUnique({ where: { userId }, select: driverSelect });
}

export async function upsertDriverProfile(userId: string, data: Record<string, unknown>) {
  await requireRole(userId, "DRIVER");
  return prisma.driverProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: driverSelect });
}

export async function getGuideProfile(userId: string) {
  await requireRole(userId, "GUIDE");
  const profile = await prisma.guideProfile.findUnique({ where: { userId }, select: guideSelect });
  if (!profile) return null;

  const { user, ...guide } = profile;
  return {
    ...guide,
    user: {
      ...user,
      verificationStatus: user.roles[0]?.verificationStatus ?? "PENDING",
      roles: undefined,
    },
  };
}

export async function listGuides(serviceCity?: string) {
  const profiles = await prisma.guideProfile.findMany({
    where: {
      isAvailable: true,
      ...(serviceCity ? { serviceCity: { equals: serviceCity, mode: "insensitive" } } : {}),
      user: {
        roles: {
          some: { role: "GUIDE", verificationStatus: { in: ["APPROVED", "VERIFIED"] } },
        },
      },
    },
    select: {
      ...guideSelect,
      user: {
        select: {
          name: true,
          roles: {
            where: { role: "GUIDE" },
            select: { verificationStatus: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return profiles.map(({ user, ...profile }) => ({
    ...profile,
    name: user.name,
    verificationStatus: user.roles[0]?.verificationStatus ?? "PENDING",
  }));
}

export async function upsertGuideProfile(userId: string, data: Record<string, unknown>) {
  await requireRole(userId, "GUIDE");
  return prisma.guideProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: guideSelect });
}

async function requireDriverProfile(userId: string) {
  await requireRole(userId, "DRIVER");
  const profile = await prisma.driverProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new Error("DRIVER_PROFILE_REQUIRED");
  return profile;
}

export async function createVehicle(userId: string, data: VehicleInput) {
  const profile = await requireDriverProfile(userId);
  return prisma.vehicle.create({
    data: {
      driverProfileId: profile.id,
      make: data.make,
      model: data.model,
      year: data.year,
      registrationNumber: data.registrationNumber,
      vehicleType: data.vehicleType,
      seatCount: data.seatCount,
      color: data.color,
      imageKey: data.imageKey,
    },
  });
}

export async function listVehicles(userId: string) {
  const profile = await requireDriverProfile(userId);
  return prisma.vehicle.findMany({ where: { driverProfileId: profile.id }, orderBy: { createdAt: "desc" } });
}

export async function updateVehicle(userId: string, vehicleId: string, data: Record<string, unknown>) {
  const profile = await requireDriverProfile(userId);
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, driverProfileId: profile.id } });
  if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");
  return prisma.vehicle.update({ where: { id: vehicleId }, data });
}

export async function deleteVehicle(userId: string, vehicleId: string) {
  const profile = await requireDriverProfile(userId);
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, driverProfileId: profile.id } });
  if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");
  return prisma.vehicle.update({ where: { id: vehicleId }, data: { isActive: false } });
}
