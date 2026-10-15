import type { Request, Response } from "express";
import { z } from "zod";
import { decideAccountVerificationRequest, listAccountVerificationRequests } from "../auth/account-verification.service";

const decisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]), rejectionReason: z.string().trim().optional() });

function errorResponse(req: Request, res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, data: null, error: { code, message }, requestId: req.requestId });
}

export async function getAccountVerificationRequests(req: Request, res: Response) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const data = await listAccountVerificationRequests({ page, limit, status });
    return res.json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ADMIN_ACCOUNT_VERIFICATION_LIST_ERROR:", error);
    return errorResponse(req, res, 500, "INTERNAL_SERVER_ERROR", "Could not load account verification requests");
  }
}

export async function decideAccountVerification(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id : undefined;
  if (!id) return errorResponse(req, res, 400, "INVALID_REQUEST_ID", "Verification request id is required");
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(req, res, 400, "VALIDATION_ERROR", "Status must be APPROVED or REJECTED");
  if (parsed.data.status === "REJECTED" && !parsed.data.rejectionReason) {
    return errorResponse(req, res, 400, "REJECTION_REASON_REQUIRED", "Rejection reason is required");
  }
  try {
    const data = await decideAccountVerificationRequest(id, parsed.data.status, parsed.data.rejectionReason);
    return res.json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
    const known: Record<string, [number, string]> = {
      REQUEST_NOT_FOUND: [404, "Verification request not found"],
      REQUEST_ALREADY_DECIDED: [409, "Verification request has already been decided"],
      REJECTION_REASON_REQUIRED: [400, "Rejection reason is required"],
    };
    const [status, message] = known[code] ?? [500, "Could not update verification request"];
    if (status >= 500) console.error("ADMIN_ACCOUNT_VERIFICATION_DECISION_ERROR:", error);
    return errorResponse(req, res, status, code, message);
  }
}
