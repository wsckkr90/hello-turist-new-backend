import { Request, Response } from "express";
import { z } from "zod";
import { createAccountVerificationRequest, getMyAccountVerificationRequest } from "./account-verification.service";

const requestSchema = z.object({ method: z.enum(["SMS", "CALL"]) });

function errorResponse(req: Request, res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, data: null, error: { code, message }, requestId: req.requestId });
}

export async function requestAccountVerification(req: Request, res: Response) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(req, res, 400, "VALIDATION_ERROR", "Choose SMS or CALL");
  try {
    const data = await createAccountVerificationRequest(req.user!.id, parsed.data.method);
    return res.status(201).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
    const known: Record<string, [number, string]> = {
      USER_NOT_FOUND: [404, "User account was not found"],
      PHONE_REQUIRED: [409, "A mobile number is required for verification"],
      ACCOUNT_DELETED: [409, "Deleted account cannot request verification"],
    };
    const [status, message] = known[code] ?? [500, "Could not create verification request"];
    if (status >= 500) console.error("ACCOUNT_VERIFICATION_REQUEST_ERROR:", error);
    return errorResponse(req, res, status, code, message);
  }
}

export async function getAccountVerificationStatus(req: Request, res: Response) {
  try {
    const data = await getMyAccountVerificationRequest(req.user!.id);
    return res.status(200).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ACCOUNT_VERIFICATION_STATUS_ERROR:", error);
    return errorResponse(req, res, 500, "INTERNAL_SERVER_ERROR", "Could not load verification status");
  }
}
