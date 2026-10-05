import "dotenv/config";

import bcrypt from "bcrypt";
import { prisma } from "../src/core/prisma";

const PASSWORD = "TestDriver@123456";

const VEHICLES = [
  { type: "CAR", make: "Maruti", model: "Swift", seats: 4, color: "White" },
  { type: "SUV", make: "Mahindra", model: "XUV700", seats: 7, color: "Black" },
  { type: "SEDAN", make: "Honda", model: "City", seats: 5, color: "Silver" },
  { type: "HATCHBACK", make: "Hyundai", model: "i20", seats: 5, color: "Blue" },
  { type: "VAN", make: "Maruti", model: "Eeco", seats: 7, color: "White" },
  { type: "BUS", make: "Tata", model: "Starbus", seats: 20, color: "White" },
  { type: "SUV", make: "Toyota", model: "Innova Crysta", seats: 7, color: "White" },
  { type: "SEDAN", make: "Hyundai", model: "Verna", seats: 5, color: "Grey" },
  { type: "CAR", make: "Tata", model: "Altroz", seats: 5, color: "Red" },
  { type: "HATCHBACK", make: "Maruti", model: "Baleno", seats: 5, color: "Blue" },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (let index = 0; index < 10; index += 1) {
    const n = String(index + 1).padStart(2, "0");
    const vehicle = VEHICLES[index];
    const username = `testdriver${n}`;
    const email = `testdriver${n}@hello-kurukshetra.com`;
    const phone = `+9199000000${n}`;
    const registrationNumber = `TEST-HK-${n}`;

    const user = await prisma.user.upsert({
      where: { username },
      update: {
        name: `Test Driver ${n}`,
        email,
        phone,
        passwordHash,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        name: `Test Driver ${n}`,
        username,
        email,
        phone,
        passwordHash,
        status: "ACTIVE",
      },
    });

    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: "DRIVER" } },
      update: { verificationStatus: "APPROVED" },
      create: {
        userId: user.id,
        role: "DRIVER",
        verificationStatus: "APPROVED",
      },
    });

    const profile = await prisma.driverProfile.upsert({
      where: { userId: user.id },
      update: {
        experienceYears: 5 + (index % 6),
        serviceCity: "Kurukshetra",
        serviceArea: "Kurukshetra",
        isAvailable: true,
      },
      create: {
        userId: user.id,
        bio: `Production test driver ${n}`,
        experienceYears: 5 + (index % 6),
        serviceCity: "Kurukshetra",
        serviceArea: "Kurukshetra",
        isAvailable: true,
      },
    });

    await prisma.vehicle.upsert({
      where: { registrationNumber },
      update: {
        driverProfileId: profile.id,
        make: vehicle.make,
        model: vehicle.model,
        year: 2025,
        vehicleType: vehicle.type,
        seatCount: vehicle.seats,
        color: vehicle.color,
        isActive: true,
      },
      create: {
        driverProfileId: profile.id,
        make: vehicle.make,
        model: vehicle.model,
        year: 2025,
        registrationNumber,
        vehicleType: vehicle.type,
        seatCount: vehicle.seats,
        color: vehicle.color,
        isActive: true,
      },
    });

    console.log(`created/updated ${username} -> ${vehicle.type}`);
  }

  console.log("\nTEST_DRIVER_PASSWORD=" + PASSWORD);
}

main()
  .catch((error) => {
    console.error("SEED_TEST_DRIVERS_ERROR:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
