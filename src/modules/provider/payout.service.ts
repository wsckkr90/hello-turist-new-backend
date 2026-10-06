import { prisma } from "../../core/prisma";
import { encryptPayoutField } from "../../core/payout-data";
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

  const payoutRecord = await prisma.driverPayout.create({
    data: {
      driverId,
      rideId,
      amount,
      mode: account.method === "UPI" ? "UPI" : "IMPS",
      status: "PENDING",
      metadata: { fundAccountId: account.razorpayFundAccountId },
    },
  });

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
    const updated = await prisma.driverPayout.update({
      where: { id: payoutRecord.id },
      data: { status: String(payout.status ?? "PROCESSING").toUpperCase(), providerPayoutId: payout.id, metadata: payout },
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

export async function listDriverPayouts(driverId: string) {
  await requireDriver(driverId);
  return prisma.driverPayout.findMany({ where: { driverId }, orderBy: { createdAt: "desc" }, take: 100 });
}
