import { prisma } from "../../core/prisma";
import { encryptPayoutField } from "../../core/payout-data";
import { notifyUser } from "../notification/notification.service";
import type { PayoutAccountInput } from "./payout.schema";

function razorpayXConfig() {
  const keyId = process.env.RAZORPAYX_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAYX_KEY_SECRET?.trim();
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
  if (!keyId || !keySecret || !accountNumber) throw new Error("RAZORPAYX_NOT_CONFIGURED");
  return { keyId, keySecret, accountNumber };
}

async function razorpayXRequest(path: string, init: RequestInit = {}) {
  const { keyId, keySecret } = razorpayXConfig();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) {
    const error = data?.error ?? {};
    const e = new Error("RAZORPAYX_REQUEST_FAILED");
    (e as any).providerCode = String(error.code ?? `HTTP_${response.status}`);
    (e as any).providerDescription = String(error.description ?? error.reason ?? "RazorpayX request failed");
    throw e;
  }
  return data;
}

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
  if (input.method === "BANK") {
    const existing = await prisma.driverPayoutAccount.findUnique({ where: { userId } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
    if (!user) throw new Error("USER_NOT_FOUND");
    const contact = await razorpayXRequest("/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: input.accountHolderName,
        ...(user.email ? { email: user.email } : {}),
        ...(user.phone ? { contact: user.phone.replace(/^\\+91/, "") } : {}),
        type: "vendor",
        reference_id: `driver_${userId}`.slice(0, 40),
      }),
    });
    const fundAccount = await razorpayXRequest("/fund_accounts", {
      method: "POST",
      body: JSON.stringify({
        contact_id: contact.id,
        account_type: "bank_account",
        bank_account: {
          name: input.accountHolderName,
          ifsc: input.ifsc,
          account_number: input.accountNumber,
        },
      }),
    });
    const saved = await prisma.driverPayoutAccount.upsert({
      where: { userId },
      create: {
        userId,
        method: "BANK",
        accountHolderName: input.accountHolderName,
        encryptedAccountNumber: encryptPayoutField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        razorpayContactId: contact.id,
        razorpayFundAccountId: fundAccount.id,
        verificationStatus: "REGISTERED",
      },
      update: {
        method: "BANK",
        accountHolderName: input.accountHolderName,
        encryptedAccountNumber: encryptPayoutField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        encryptedUpiVpa: null,
        razorpayContactId: contact.id,
        razorpayFundAccountId: fundAccount.id,
        verificationStatus: "REGISTERED",
      },
    });
    return publicAccount({ ...saved, upiVpaMasked: null });
  }

  const existing = await prisma.driverPayoutAccount.findUnique({ where: { userId } });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
  if (!user) throw new Error("USER_NOT_FOUND");
  const contact = await razorpayXRequest("/contacts", {
    method: "POST",
    body: JSON.stringify({
      name: user.name,
      ...(user.email ? { email: user.email } : {}),
      ...(user.phone ? { contact: user.phone.replace(/^\\+91/, "") } : {}),
      type: "vendor",
      reference_id: `driver_${userId}`.slice(0, 40),
    }),
  });
  const fundAccount = await razorpayXRequest("/fund_accounts", {
    method: "POST",
    body: JSON.stringify({
      contact_id: contact.id,
      account_type: "vpa",
      vpa: { address: input.upiVpa },
    }),
  });
  const saved = await prisma.driverPayoutAccount.upsert({
    where: { userId },
    create: {
      userId,
      method: "UPI",
      encryptedUpiVpa: encryptPayoutField(input.upiVpa),
      razorpayContactId: contact.id,
      razorpayFundAccountId: fundAccount.id,
      verificationStatus: "REGISTERED",
    },
    update: {
      method: "UPI",
      accountHolderName: null,
      encryptedAccountNumber: null,
      accountNumberLast4: null,
      ifsc: null,
      encryptedUpiVpa: encryptPayoutField(input.upiVpa),
      razorpayContactId: contact.id,
      razorpayFundAccountId: fundAccount.id,
      verificationStatus: "REGISTERED",
    },
  });
  return publicAccount({ ...saved, upiVpaMasked: input.upiVpa.replace(/^(.{2}).*(@.*)$/, "$1••••$2") });
}

export async function createDriverPayout(driverId: string, amount: number, rideId?: string) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_PAYOUT_AMOUNT");
  const account = await prisma.driverPayoutAccount.findUnique({ where: { userId: driverId } });
  if (!account?.razorpayFundAccountId) throw new Error("PAYOUT_ACCOUNT_NOT_READY");
  if (account.verificationStatus !== "REGISTERED" && account.verificationStatus !== "VERIFIED") throw new Error("PAYOUT_ACCOUNT_NOT_READY");

  let payoutRecord = rideId
    ? await prisma.driverPayout.findUnique({ where: { rideId } })
    : null;

  if (payoutRecord && ["PROCESSED", "PROCESSING", "QUEUED", "PENDING"].includes(payoutRecord.status)) return payoutRecord;
  if (!payoutRecord) {
    payoutRecord = await prisma.driverPayout.create({
      data: {
        driverId,
        rideId,
        amount,
        mode: account.method === "UPI" ? "UPI" : "IMPS",
        status: "PENDING",
        metadata: { fundAccountId: account.razorpayFundAccountId, commissionPercent: 0, driverEarningPercent: 100 },
      },
    });
  } else {
    payoutRecord = await prisma.driverPayout.update({
      where: { id: payoutRecord.id },
      data: {
        driverId,
        amount,
        mode: account.method === "UPI" ? "UPI" : "IMPS",
        status: "PENDING",
        failureReason: null,
        metadata: { ...((payoutRecord.metadata as Record<string, unknown> | null) ?? {}), fundAccountId: account.razorpayFundAccountId, commissionPercent: 0, driverEarningPercent: 100 },
      },
    });
  }

  try {
    const config = razorpayXConfig();
    const payout = await razorpayXRequest("/payouts", {
      method: "POST",
      headers: { "X-Payout-Idempotency": payoutRecord.id },
      body: JSON.stringify({
        account_number: config.accountNumber,
        fund_account_id: account.razorpayFundAccountId,
        amount: Math.round(amount * 100),
        currency: "INR",
        mode: account.method === "UPI" ? "UPI" : "IMPS",
        purpose: "vendor_bill",
        queue_if_low_balance: true,
        reference_id: `driver_payout_${payoutRecord.id}`.slice(0, 40),
        narration: "Hello Kurukshetra driver payout",
      }),
    });
    const providerStatus = String(payout.status ?? "processing").toUpperCase();
    const updated = await prisma.driverPayout.update({
      where: { id: payoutRecord.id },
      data: { status: providerStatus, providerPayoutId: payout.id, metadata: { ...((payoutRecord.metadata as Record<string, unknown> | null) ?? {}), provider: payout } },
    });
    return updated;
  } catch (error) {
    await prisma.driverPayout.update({
      where: { id: payoutRecord.id },
      data: { status: "FAILED", failureReason: error instanceof Error ? error.message : "RAZORPAYX_REQUEST_FAILED" },
    });
    throw error;
  }
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

export async function applyRazorpayXPayoutWebhook(event: string, payload: any) {
  const entity = payload?.payout?.entity;
  const providerPayoutId = entity?.id;
  if (!providerPayoutId) throw new Error("INVALID_RAZORPAYX_PAYOUT_WEBHOOK");
  const payout = await prisma.driverPayout.findUnique({ where: { providerPayoutId } });
  if (!payout) throw new Error("PAYOUT_NOT_FOUND");

  const incomingStatus = String(entity.status ?? event.replace(/^payout\./, "")).toUpperCase();
  const terminal = new Set(["PROCESSED", "REVERSED", "FAILED", "CANCELLED", "REJECTED"]);
  if (terminal.has(payout.status) && payout.status !== incomingStatus) return payout;

  const status = incomingStatus === "INITIATED" ? "PROCESSING" : incomingStatus;
  const updated = await prisma.driverPayout.update({
    where: { id: payout.id },
    data: {
      status,
      failureReason: entity.failure_reason ?? entity.error?.description ?? (["FAILED", "REVERSED", "CANCELLED", "REJECTED"].includes(status) ? "RazorpayX payout did not complete" : payout.failureReason),
      metadata: { ...((payout.metadata as Record<string, unknown> | null) ?? {}), webhookEvent: event, provider: entity },
    },
  });
  return updated;
}

export async function listDriverPayouts(driverId: string) {
  await requireDriver(driverId);
  return prisma.driverPayout.findMany({ where: { driverId }, orderBy: { createdAt: "desc" }, take: 100 });
}
