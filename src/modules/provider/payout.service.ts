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


async function requireGuide(userId: string) {
  const role = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role: "GUIDE" } },
    select: { verificationStatus: true },
  });
  if (!role) throw new Error("ROLE_NOT_FOUND");
  return role;
}

export async function getGuidePayoutAccount(userId: string) {
  await requireGuide(userId);
  const account = await prisma.guidePayoutAccount.findUnique({ where: { userId } });
  if (!account) return null;
  return publicAccount({
    ...account,
    razorpayFundAccountId: null,
    upiVpaMasked: account.encryptedUpiVpa ? "••••••@••••" : null,
  });
}

export async function upsertGuidePayoutAccount(userId: string, input: PayoutAccountInput) {
  await requireGuide(userId);
  const common = { verificationStatus: "PENDING" };
  if (input.method === "BANK") {
    const saved = await prisma.guidePayoutAccount.upsert({
      where: { userId },
      create: {
        userId, method: "BANK", accountHolderName: input.accountHolderName,
        encryptedAccountNumber: encryptPayoutField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4), ifsc: input.ifsc,
        encryptedUpiVpa: null, ...common,
      },
      update: {
        method: "BANK", accountHolderName: input.accountHolderName,
        encryptedAccountNumber: encryptPayoutField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4), ifsc: input.ifsc,
        encryptedUpiVpa: null, ...common,
      },
    });
    return publicAccount({ ...saved, upiVpaMasked: null, razorpayFundAccountId: null });
  }

  const saved = await prisma.guidePayoutAccount.upsert({
    where: { userId },
    create: {
      userId, method: "UPI", encryptedUpiVpa: encryptPayoutField(input.upiVpa),
      accountHolderName: null, encryptedAccountNumber: null, accountNumberLast4: null,
      ifsc: null, ...common,
    },
    update: {
      method: "UPI", encryptedUpiVpa: encryptPayoutField(input.upiVpa),
      accountHolderName: null, encryptedAccountNumber: null, accountNumberLast4: null,
      ifsc: null, ...common,
    },
  });
  return publicAccount({
    ...saved, razorpayFundAccountId: null,
    upiVpaMasked: input.upiVpa.replace(/^(.{2}).*(@.*)$/, "$1••••$2"),
  });
}

export async function listGuidePayouts(guideId: string) {
  await requireGuide(guideId);
  return prisma.guidePayout.findMany({ where: { guideId }, orderBy: { createdAt: "desc" }, take: 100 });
}

function indiaWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  const day = `${value("year")}-${value("month")}-${value("day")}`;
  const month = `${value("year")}-${value("month")}-01`;
  return {
    todayStart: new Date(`${day}T00:00:00+05:30`),
    monthStart: new Date(`${month}T00:00:00+05:30`),
    now,
  };
}

function summarizeProviderFinance(
  rides: Array<{ id: string; fareAmount: unknown; completedAt: Date | null }>,
  payouts: Array<{ rideId: string | null; amount: unknown; status: string; createdAt: Date; updatedAt: Date }>,
  window: ReturnType<typeof indiaWindow>,
) {
  const todayRides = rides.filter(ride => ride.completedAt && ride.completedAt >= window.todayStart && ride.completedAt <= window.now);
  const monthRides = rides.filter(ride => ride.completedAt && ride.completedAt >= window.monthStart && ride.completedAt <= window.now);
  const sumFare = (items: typeof rides) => items.reduce((sum, ride) => sum + Number(ride.fareAmount ?? 0), 0);
  const paidStatuses = new Set(["PAID", "COMPLETED", "SUCCESS", "PROCESSED"]);
  const summarizePayouts = (since: Date, periodRides: typeof rides) => {
    const items = payouts.filter(payout => {
      const isPaid = paidStatuses.has(payout.status.toUpperCase());
      const effectiveDate = isPaid ? payout.updatedAt : payout.createdAt;
      return effectiveDate >= since && effectiveDate <= window.now;
    });
    return {
      paidAmount: items.filter(payout => paidStatuses.has(payout.status.toUpperCase())).reduce((sum, payout) => sum + Number(payout.amount), 0),
      pendingAmount: items.filter(payout => !paidStatuses.has(payout.status.toUpperCase())).reduce((sum, payout) => sum + Number(payout.amount), 0),
      paidCount: items.filter(payout => paidStatuses.has(payout.status.toUpperCase())).length,
      notPaidCount: items.filter(payout => !paidStatuses.has(payout.status.toUpperCase())).length,
      paidRideCount: periodRides.filter(ride => payouts.some(payout => payout.rideId === ride.id && paidStatuses.has(payout.status.toUpperCase()))).length,
      unpaidRideCount: periodRides.filter(ride => !payouts.some(payout => payout.rideId === ride.id && paidStatuses.has(payout.status.toUpperCase()))).length,
    };
  };
  return {
    currency: "INR",
    note: "Ride fare is gross booking value, not provider net earnings. Paid amounts reflect recorded payout transfers only; no payout is assumed from ride completion.",
    today: { completedRides: todayRides.length, grossRideFare: Number(sumFare(todayRides).toFixed(2)), ...summarizePayouts(window.todayStart, todayRides) },
    monthly: { completedRides: monthRides.length, grossRideFare: Number(sumFare(monthRides).toFixed(2)), ...summarizePayouts(window.monthStart, monthRides) },
    payoutConfiguration: "PAYOUT_PROVIDER_NOT_CONFIGURED",
  };
}

export async function getDriverFinance(userId: string) {
  await requireDriver(userId);
  const [rides, payouts] = await Promise.all([
    prisma.ride.findMany({
      where: { status: "COMPLETED", assignments: { some: { driverId: userId, status: "ACCEPTED" } } },
      select: {
        id: true, pickupAddress: true, dropoffAddress: true, fareAmount: true, fareCurrency: true,
        paymentMethod: true, createdAt: true, completedAt: true,
        payment: { select: { status: true, amount: true, provider: true, paidAt: true } },
      },
      orderBy: { completedAt: "desc" }, take: 500,
    }),
    prisma.driverPayout.findMany({ where: { driverId: userId }, select: { rideId: true, amount: true, status: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const payoutByRide = new Map(payouts.filter((item) => item.rideId).map((item) => [item.rideId!, item]));
  const rideHistory = rides.slice(0, 50).map((ride) => {
    const payout = payoutByRide.get(ride.id);
    return {
      rideId: ride.id,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      completedAt: ride.completedAt?.toISOString() ?? null,
      createdAt: ride.createdAt.toISOString(),
      grossFare: Number(ride.fareAmount ?? 0),
      currency: ride.fareCurrency,
      paymentMethod: ride.paymentMethod,
      riderPaymentStatus: ride.paymentMethod === "MONTHLY_PASS"
        ? "PASS_COVERED"
        : ride.payment
          ? String(ride.payment.status)
          : ride.paymentMethod === "CASH" ? "CASH_ON_RIDE" : "NO_PAYMENT_RECORD",
      riderPaymentAmount: ride.payment ? Number(ride.payment.amount) : null,
      paymentProvider: ride.payment?.provider ?? null,
      riderPaidAt: ride.payment?.paidAt?.toISOString() ?? null,
      payoutAmount: payout ? Number(payout.amount) : 0,
      payoutStatus: payout ? String(payout.status).toUpperCase() : "NOT_PAID",
      payoutUpdatedAt: payout?.updatedAt.toISOString() ?? null,
    };
  });
  return { ...summarizeProviderFinance(rides, payouts, indiaWindow()), rideHistory };
}

export async function getGuideFinance(userId: string) {
  await requireGuide(userId);
  const [rides, payouts] = await Promise.all([
    prisma.ride.findMany({
      where: { status: "COMPLETED", assignments: { some: { guideId: userId, status: "ACCEPTED" } } },
      select: {
        id: true, pickupAddress: true, dropoffAddress: true, fareAmount: true, fareCurrency: true,
        paymentMethod: true, createdAt: true, completedAt: true,
        payment: { select: { status: true, amount: true, provider: true, paidAt: true } },
      },
      orderBy: { completedAt: "desc" }, take: 500,
    }),
    prisma.guidePayout.findMany({ where: { guideId: userId }, select: { rideId: true, amount: true, status: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const payoutByRide = new Map(payouts.filter((item) => item.rideId).map((item) => [item.rideId!, item]));
  const rideHistory = rides.slice(0, 50).map((ride) => {
    const payout = payoutByRide.get(ride.id);
    return {
      rideId: ride.id,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      completedAt: ride.completedAt?.toISOString() ?? null,
      createdAt: ride.createdAt.toISOString(),
      grossFare: Number(ride.fareAmount ?? 0),
      currency: ride.fareCurrency,
      paymentMethod: ride.paymentMethod,
      riderPaymentStatus: ride.paymentMethod === "MONTHLY_PASS"
        ? "PASS_COVERED"
        : ride.payment
          ? String(ride.payment.status)
          : ride.paymentMethod === "CASH" ? "CASH_ON_RIDE" : "NO_PAYMENT_RECORD",
      riderPaymentAmount: ride.payment ? Number(ride.payment.amount) : null,
      paymentProvider: ride.payment?.provider ?? null,
      riderPaidAt: ride.payment?.paidAt?.toISOString() ?? null,
      payoutAmount: payout ? Number(payout.amount) : 0,
      payoutStatus: payout ? String(payout.status).toUpperCase() : "NOT_PAID",
      payoutUpdatedAt: payout?.updatedAt.toISOString() ?? null,
    };
  });
  return { ...summarizeProviderFinance(rides, payouts, indiaWindow()), rideHistory };
}
