import crypto from "crypto";
import jwt from "jsonwebtoken";

import { prisma } from "../../core/prisma";
import { verifyFirebaseIdToken } from "../../config/firebase-admin";
import { registerUser } from "./auth.service";

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) return `+91${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new Error("INVALID_PHONE_NUMBER");
}

function validatePhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("INVALID_PHONE_NUMBER");
  }
  return normalized;
}

async function issueSession(user: {
  id: string;
  username: string;
  name: string;
  email: string | null;
  status: string;
  preferredLanguage: string;
  phone: string | null;
}) {
  if (user.status !== "ACTIVE") {
    throw new Error("ACCOUNT_NOT_ACTIVE");
  }

  const accessToken = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: "15m" }
  );

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.refreshSession.create({
    data: {
      tokenHash: refreshTokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    },
  };
}

async function findUserByFirebaseUid(firebaseUid: string) {
  return prisma.user.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
}

async function findUserByPhone(phone: string) {
  return prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });
}

async function attachFirebaseIdentity(userId: string, firebaseUid: string, phone: string) {
  const firebaseOwner = await findUserByFirebaseUid(firebaseUid);
  if (firebaseOwner && firebaseOwner.id !== userId) {
    throw new Error("GOOGLE_ACCOUNT_ALREADY_LINKED");
  }

  const phoneOwner = await findUserByPhone(phone);
  if (phoneOwner && phoneOwner.id !== userId) {
    throw new Error("PHONE_ALREADY_EXISTS");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      firebaseUid,
      phone,
      phoneVerificationStatus: "VERIFIED",
      phoneVerifiedAt: new Date(),
      phoneVerificationMethod: "FIREBASE",
    },
  });
}

async function getUserForSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      status: true,
      preferredLanguage: true,
      phone: true,
    },
  });

  if (!user) throw new Error("USER_NOT_FOUND");

  return user;
}

export async function registerUserWithPhone(input: {
  name: string;
  username: string;
  email?: string;
  password: string;
  phone: string;
  idToken: string;
  termsAccepted: true;
  termsVersion: string;
}) {
  const requestedPhone = validatePhone(input.phone);
  if (!input.idToken.trim()) throw new Error("INVALID_FIREBASE_ID_TOKEN");

  const decoded = await verifyFirebaseIdToken(input.idToken.trim());
  const firebaseUid = decoded.uid;
  const tokenPhone =
    typeof decoded.phone_number === "string"
      ? validatePhone(decoded.phone_number)
      : null;

  if (!tokenPhone) throw new Error("FIREBASE_PHONE_NUMBER_MISSING");
  if (tokenPhone !== requestedPhone) throw new Error("PHONE_MISMATCH");

  const existingPhone = await findUserByPhone(requestedPhone);
  if (existingPhone) throw new Error("PHONE_ALREADY_EXISTS");

  const existingFirebase = await findUserByFirebaseUid(firebaseUid);
  if (existingFirebase) throw new Error("PHONE_ALREADY_EXISTS");

  const user = await registerUser({
    name: input.name,
    username: input.username,
    email: input.email,
    password: input.password,
    termsAccepted: input.termsAccepted,
    termsVersion: input.termsVersion,
  });

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        phone: requestedPhone,
        firebaseUid,
        phoneVerificationStatus: "VERIFIED",
        phoneVerifiedAt: new Date(),
        phoneVerificationMethod: "FIREBASE",
      },
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }

  return { ...user, phone: requestedPhone };
}

export async function loginWithGoogle(input: {
  idToken: string;
  phone?: string;
  phoneIdToken?: string;
  termsAccepted?: true;
  termsVersion?: string;
}) {
  if (!input.idToken.trim()) throw new Error("INVALID_FIREBASE_ID_TOKEN");

  const decoded = await verifyFirebaseIdToken(input.idToken.trim());
  const firebaseUid = decoded.uid;
  const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : undefined;
  const name =
    typeof decoded.name === "string" && decoded.name.trim()
      ? decoded.name.trim()
      : email?.split("@")[0] || "Google user";

  const requestedPhone = input.phone?.trim() ? validatePhone(input.phone) : null;
  if (input.phoneIdToken?.trim()) {
    const phoneDecoded = await verifyFirebaseIdToken(input.phoneIdToken.trim());
    const verifiedPhone = typeof phoneDecoded.phone_number === "string"
      ? validatePhone(phoneDecoded.phone_number)
      : null;
    if (!verifiedPhone) throw new Error("FIREBASE_PHONE_NUMBER_MISSING");
    if (!requestedPhone || verifiedPhone !== requestedPhone) throw new Error("PHONE_MISMATCH");
  }

  const existingByFirebase = await findUserByFirebaseUid(firebaseUid);
  let userId: string | undefined = existingByFirebase?.id;

  if (!userId && email) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingByEmail) {
      userId = existingByEmail.id;
    }
  }

  if (userId) {
    const existingUser = await getUserForSession(userId);

    if (existingUser.phone) {
      if (existingByFirebase?.id !== userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { firebaseUid },
        });
      }
    } else {
      if (!requestedPhone || !input.phoneIdToken?.trim()) throw new Error("GOOGLE_PHONE_VERIFICATION_REQUIRED");
      await attachFirebaseIdentity(userId, firebaseUid, requestedPhone);
    }
  } else {
    if (!requestedPhone || !input.phoneIdToken?.trim()) throw new Error("GOOGLE_PHONE_VERIFICATION_REQUIRED");
    const phone = requestedPhone;
    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) throw new Error("PHONE_ALREADY_EXISTS");

    const base = (email?.split("@")[0] || `google_${firebaseUid}`)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "")
      .slice(0, 50) || `google_${firebaseUid.slice(0, 20)}`;

    let username = base;
    let suffix = 0;
    while (true) {
      const existing = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!existing) break;
      suffix += 1;
      username = `${base.slice(0, 70 - String(suffix).length)}_${suffix}`;
    }

    if (input.termsAccepted !== true || !input.termsVersion?.trim()) {
      throw new Error("TERMS_CONSENT_REQUIRED");
    }

    const created = await registerUser({
      name,
      username,
      email,
      password: crypto.randomBytes(48).toString("base64url"),
      termsAccepted: input.termsAccepted,
      termsVersion: input.termsVersion.trim(),
    });

    userId = created.id;
    await attachFirebaseIdentity(userId, firebaseUid, phone);
  }

  const user = await getUserForSession(userId);
  return issueSession(user);
}
