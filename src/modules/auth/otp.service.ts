import crypto from "crypto";
import jwt from "jsonwebtoken";

import { prisma } from "../../core/prisma";
import { verifyFirebaseIdToken } from "../../config/firebase-admin";

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error("INVALID_PHONE_NUMBER");
}

async function findUserByPhone(phone: string) {
  return prisma.user.findFirst({
    where: { phone, status: "ACTIVE" },
    select: { id: true },
  });
}

async function findUserByFirebaseUid(firebaseUid: string) {
  return prisma.user.findFirst({
    where: { firebaseUid, status: "ACTIVE" },
    select: { id: true },
  });
}

async function issueSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      status: true,
      preferredLanguage: true,
    },
  });

  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.status !== "ACTIVE") throw new Error("ACCOUNT_NOT_ACTIVE");

  const accessToken = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: "15m" }
  );
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

  await prisma.refreshSession.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      ...user,
    },
  };
}

/**
 * Firebase Phone Authentication sends the SMS OTP and performs the client-side
 * verification. The app then sends the Firebase ID token here. The backend
 * verifies the token cryptographically and issues the application's session.
 */
export async function verifyFirebasePhoneToken(idToken: string, inputPhone?: string) {
  if (!idToken.trim()) throw new Error("INVALID_FIREBASE_ID_TOKEN");

  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(idToken.trim());
  } catch (error) {
    if (error instanceof Error && (
      error.message === "FIREBASE_ADMIN_NOT_CONFIGURED" ||
      error.message === "FIREBASE_CERTIFICATE_FETCH_FAILED"
    )) {
      throw error;
    }
    throw new Error("INVALID_FIREBASE_ID_TOKEN");
  }
  const firebaseUid = decoded.uid;
  const tokenPhone = typeof decoded.phone_number === "string" ? normalizePhone(decoded.phone_number) : null;
  const requestedPhone = inputPhone?.trim() ? normalizePhone(inputPhone) : null;

  if (!tokenPhone) throw new Error("FIREBASE_PHONE_NUMBER_MISSING");
  if (requestedPhone && requestedPhone !== tokenPhone) throw new Error("PHONE_MISMATCH");

  let user = await findUserByFirebaseUid(firebaseUid);
  if (!user) user = await findUserByPhone(tokenPhone);
  if (!user) throw new Error("PHONE_NOT_REGISTERED");

  const owner = await findUserByFirebaseUid(firebaseUid);
  if (!owner) {
    const existingPhoneOwner = await findUserByPhone(tokenPhone);
    if (existingPhoneOwner && existingPhoneOwner.id !== user.id) {
      throw new Error("PHONE_ALREADY_EXISTS");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { firebaseUid, phone: tokenPhone },
    });
  }

  return issueSession(user.id);
}

/**
 * Kept as an explicit migration response for old clients. OTP delivery must not
 * be performed by the backend because Firebase Phone Authentication owns the
 * SMS verification flow.
 */
export async function requestOtp(inputPhone: string) {
  const phone = normalizePhone(inputPhone);
  const existing = await findUserByPhone(phone);
  if (!existing) throw new Error("PHONE_NOT_REGISTERED");
  return {
    phone,
    provider: "firebase",
    message: "Start Firebase Phone Authentication on the client and submit the Firebase ID token to /auth/otp/verify.",
  };
}

export async function verifyOtp(inputPhone: string, inputOtp: string) {
  // inputOtp is now the Firebase ID token for backward-compatible controller wiring.
  return verifyFirebasePhoneToken(inputOtp, inputPhone);
}
