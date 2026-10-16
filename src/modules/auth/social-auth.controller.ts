import { Request, Response } from "express";
import { z } from "zod";

import {
  loginWithGoogle,
  registerUserWithPhone,
} from "./social-auth.service";

export const registerWithPhoneSchema = z.object({
  name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  termsAccepted: z.literal(true),
  termsVersion: z.string().trim().min(1).max(40).default("2026-10-13"),
  phone: z.string().trim().min(8).max(20),
  idToken: z.string().trim().min(20).optional(),
  manualVerification: z.boolean().optional().default(false),
  manualVerificationMethod: z.enum(["SMS", "CALL"]).optional(),
}).superRefine((value, ctx) => {
  if (value.manualVerification) {
    if (!value.manualVerificationMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manualVerificationMethod"],
        message: "Choose SMS or CALL for manual phone verification.",
      });
    }
  } else if (!value.idToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idToken"],
      message: "A verified Firebase phone token is required.",
    });
  }
});

export const googleAuthSchema = z.object({
  idToken: z.string().trim().min(20),
  phone: z.string().trim().min(8).max(20).optional(),
  phoneIdToken: z.string().trim().min(20).optional(),
  // Required only when this Google identity creates a new account.
  termsAccepted: z.literal(true).optional(),
  termsVersion: z.string().trim().min(1).max(40).optional(),
});

function sendError(res: Response, req: Request, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message },
    requestId: req.requestId,
  });
}

export async function registerWithPhone(req: Request, res: Response) {
  const parsed = registerWithPhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, req, 400, "VALIDATION_ERROR", "Name, username, password and mobile number are required");
  }

  try {
    const user = await registerUserWithPhone(parsed.data);
    return res.status(201).json({
      success: true,
      data: { user },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PHONE_ALREADY_EXISTS") return sendError(res, req, 409, error.message, "Phone number is already registered");
      if (error.message === "USERNAME_ALREADY_EXISTS") return sendError(res, req, 409, error.message, "Username is already registered");
      if (error.message === "EMAIL_ALREADY_EXISTS") return sendError(res, req, 409, error.message, "Email is already registered");
      if (error.message === "INVALID_PHONE_NUMBER") return sendError(res, req, 400, error.message, "Enter a valid mobile number");
      if (error.message === "INVALID_FIREBASE_ID_TOKEN" || error.message.startsWith("auth/")) return sendError(res, req, 401, "INVALID_FIREBASE_ID_TOKEN", "Phone verification could not be verified");
      if (error.message === "PHONE_MISMATCH") return sendError(res, req, 401, error.message, "Verified phone number does not match the account phone number");
      if (error.message === "FIREBASE_PHONE_NUMBER_MISSING") return sendError(res, req, 401, error.message, "A verified phone number is required");
    }
    console.error("REGISTER_WITH_PHONE_ERROR:", error);
    return sendError(res, req, 500, "INTERNAL_SERVER_ERROR", "Something went wrong");
  }
}

export async function googleAuth(req: Request, res: Response) {
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, req, 400, "VALIDATION_ERROR", "Google account information is invalid");
  }

  try {
    const result = await loginWithGoogle(parsed.data);
    return res.status(200).json({
      success: true,
      data: result,
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_PHONE_NUMBER") return sendError(res, req, 400, error.message, "Enter a valid mobile number");
      if (error.message === "TERMS_CONSENT_REQUIRED") return sendError(res, req, 400, error.message, "Accept the terms before creating your account");
      if (error.message === "GOOGLE_PHONE_REQUIRED" || error.message === "GOOGLE_PHONE_VERIFICATION_REQUIRED") return sendError(res, req, 400, error.message, "Verify your mobile number before creating your Google account");
      if (error.message === "PHONE_ALREADY_EXISTS") return sendError(res, req, 409, error.message, "Phone number is already registered to another account");
      if (error.message === "GOOGLE_ACCOUNT_ALREADY_LINKED") return sendError(res, req, 409, error.message, "Google account is already linked to another account");
      if (error.message === "PHONE_MISMATCH") return sendError(res, req, 401, error.message, "Verified phone number does not match the account phone number");
      if (error.message === "FIREBASE_PHONE_NUMBER_MISSING") return sendError(res, req, 401, error.message, "A verified phone number is required");
      if (error.message === "ACCOUNT_NOT_ACTIVE") return sendError(res, req, 403, error.message, "Account is not active");
      if (error.message === "FIREBASE_ADMIN_NOT_CONFIGURED") return sendError(res, req, 503, "FIREBASE_NOT_CONFIGURED", "Google sign-in is not configured on the server");
      if (error.message.startsWith("auth/")) return sendError(res, req, 401, "INVALID_FIREBASE_ID_TOKEN", "Google sign-in could not be verified");
    }
    console.error("GOOGLE_AUTH_ERROR:", error);
    return sendError(res, req, 401, "INVALID_FIREBASE_ID_TOKEN", "Google sign-in could not be verified");
  }
}
