import { prisma } from "../../core/prisma";
import { registerUser } from "./auth.service";
import { createAccountVerificationRequest, AccountVerificationMethod } from "./account-verification.service";

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error("INVALID_PHONE_NUMBER");
}

export async function registerUserWithManualPhoneVerification(input: {
  name: string;
  username: string;
  email?: string;
  password: string;
  phone: string;
  termsAccepted: true;
  termsVersion: string;
  manualVerificationMethod: AccountVerificationMethod;
}) {
  const phone = normalizePhone(input.phone);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("INVALID_PHONE_NUMBER");

  const existingPhone = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (existingPhone) throw new Error("PHONE_ALREADY_EXISTS");

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
        phone,
        phoneVerificationStatus: "PENDING",
        phoneVerifiedAt: null,
        phoneVerificationMethod: input.manualVerificationMethod,
      },
    });

    await createAccountVerificationRequest(user.id, input.manualVerificationMethod);
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }

  return { ...user, phone, phoneVerificationStatus: "PENDING" };
}
