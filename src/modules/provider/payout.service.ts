import { prisma } from "../../core/prisma";
import { encryptPayoutField } from "../../core/payout-data";
import { notifyUser } from "../notification/notification.service";
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

export async function settleCompletedRidePayout(rideId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      payment: { select: { amount: true, status: true, currency: true } },
      assignments: { where: { status: "ACCEPTED" }, orderBy: { acceptedAt: "desc" }, take: 1, select: { driverId: true } },
    },
  });
  if (!ride) throw new Error("RIDE_NOT_FOUND");
  if (ride.status !== "COMPLETED") throw new Error("INVALID_RIDE_STATE");
  if (!ride.payment || ride.payment.status !== "CAPTURED") throw new Error("DRIVER_PAYOUT_PAYMENT_NOT_CAPTURED");
  if (ride.payment.currency !== "INR") throw new Error("DRIVER_PAYOUT_CURRENCY_UNSUPPORTED");
  const assignment = ride.assignments[0];
  if (!assignment) throw new Error("DRIVER_ASSIGNMENT_NOT_FOUND");

  const amount = Number(ride.payment.amount);
  const payout = await createDriverPayout(assignment.driverId, amount, ride.id);
  void notifyUser(
    assignment.driverId,
    payout.status === "PROCESSED" ? "Driver payout completed" : "Driver payout initiated",
    payout.status === "PROCESSED"
      ? `₹${amount.toFixed(2)} has been paid for your completed ride.`
      : `Your ₹${amount.toFixed(2)} ride earning payout has been initiated.`,
    { rideId: ride.id, payoutId: payout.id, status: payout.status, amount, commissionPercent: 0 },
  ).catch(() => undefined);
  return payout;
}

export async function listDriverPayouts(driverId: string) {
  await requireDriver(driverId);
  return prisma.driverPayout.findMany({ where: { driverId }, orderBy: { createdAt: "desc" }, take: 100 });
}
