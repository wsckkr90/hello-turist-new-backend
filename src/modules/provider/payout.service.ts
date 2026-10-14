import { prisma } from "../../core/prisma";
import { encryptPayoutField } from "../../core/payout-data";
import type { PayoutAccountInput } from "./payout.schema";

function publicAccount(account: any) {
  return {
    id: account.id,
    method: account.method,
    accountHolderName: account.accountHolderName,
    accountNumberLast4: account.accountNumberLast4,
    ifsc: account.ifsc,
    upiVpa: account.upiVpaMasked,
    verificationStatus: account.verificationStatus,
    razorpayFundAccountId: account.razorpayFundAccountId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function getDriverPayoutAccount(userId: string) {
  await requireDriver(userId);
  const account = await prisma.driverPayoutAccount.findUnique({ where: { userId } });
  if (!account) return null;
  return publicAccount({
    ...account,
    upiVpaMasked: account.encryptedUpiVpa ? "••••••" + "@" + "••••" : null,
  });
}

async function requireDriver(userId: string) {
  const role = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "DRIVER" } },
    select: { verificationStatus: true },
  });
  if (!role) throw new Error("ROLE_NOT_FOUND");
  return role;
}

export async function upsertDriverPayoutAccount(userId: string, input: PayoutAccountInput) {
  await requireDriver(userId);
  const common = {
    razorpayContactId: null,
    razorpayFundAccountId: null,
    verificationStatus: "PENDING",
  };
  if (input.method === "BANK") {
    const saved = await prisma.driverPayoutAccount.upsert({
      where: { userId },
      create: {
        userId,
        method: "BANK",
        accountHolderName: input.accountHolderName,
        encryptedAccountNumber: encryptPayoutField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        encryptedUpiVpa: null,
        ...common,
      },
      update: {
        method: "BANK",
        accountHolderName: input.accountHolderName,
        encryptedAccountNumber: encryptPayoutField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        encryptedUpiVpa: null,
        ...common,
      },
    });
    return publicAccount({ ...saved, upiVpaMasked: null });
  }

  const saved = await prisma.driverPayoutAccount.upsert({
    where: { userId },
    create: {
      userId,
      method: "UPI",
      encryptedUpiVpa: encryptPayoutField(input.upiVpa),
      accountHolderName: null,
      encryptedAccountNumber: null,
      accountNumberLast4: null,
      ifsc: null,
      ...common,
    },
    update: {
      method: "UPI",
      accountHolderName: null,
      encryptedAccountNumber: null,
      accountNumberLast4: null,
      ifsc: null,
      encryptedUpiVpa: encryptPayoutField(input.upiVpa),
      ...common,
    },
  });
  return publicAccount({ ...saved, upiVpaMasked: input.upiVpa.replace(/^(.{2}).*(@.*)$/, "$1••••$2") });
}

export async function createDriverPayout(_driverId: string, _amount: number, _rideId?: string) {
  // Rider payment capture through Razorpay webhooks does not transfer money to providers.
  // Keep payouts disabled until a separate, approved payout provider/process is configured.
  throw new Error("PAYOUT_PROVIDER_NOT_CONFIGURED");
}

export async function settleCompletedRidePayout(_rideId: string) {
  // Completing a ride and capturing its payment do not imply that provider funds were transferred.
  throw new Error("PAYOUT_PROVIDER_NOT_CONFIGURED");
}

export async function listDriverPayouts(driverId: string) {
  await requireDriver(driverId);
  return prisma.driverPayout.findMany({ where: { driverId }, orderBy: { createdAt: "desc" }, take: 100 });
}
