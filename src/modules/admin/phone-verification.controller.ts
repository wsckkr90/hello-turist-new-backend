import { Request, Response } from "express";
import { prisma } from "../../core/prisma";
import { adminPhoneVerificationSchema } from "./phone-verification.schema";
import { writeAuditLog } from "./audit.service";

function errorResponse(req: Request, res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, data: null, error: { code, message }, requestId: req.requestId });
}

/** Admin-controlled fallback: never accepts a client-supplied verification token. */
export async function verifyUserPhoneByAdmin(req: Request, res: Response) {
  const userId = typeof req.params.userId === "string" ? req.params.userId : undefined;
  if (!userId) return errorResponse(req, res, 400, "INVALID_USER_ID", "User id is required");
  const parsed = adminPhoneVerificationSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(req, res, 400, "VALIDATION_ERROR", "Choose SMS, CALL, or IN_PERSON and provide a valid note");

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, phone: true, status: true, phoneVerificationStatus: true },
    });
    if (!user) return errorResponse(req, res, 404, "USER_NOT_FOUND", "User not found");
    if (user.status !== "ACTIVE") return errorResponse(req, res, 409, "USER_NOT_ACTIVE", "Only active users can be phone-verified");
    if (!user.phone) return errorResponse(req, res, 409, "PHONE_REQUIRED", "User has no phone number on their account");

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { phoneVerificationStatus: "VERIFIED", phoneVerifiedAt: now, phoneVerificationMethod: parsed.data.method },
      select: { id: true, name: true, username: true, phone: true, phoneVerificationStatus: true, phoneVerifiedAt: true, phoneVerificationMethod: true },
    });
    await writeAuditLog({
      actorUserId: req.user!.id,
      action: "USER_PHONE_VERIFIED_BY_ADMIN",
      entityType: "USER",
      entityId: userId,
      requestId: req.requestId,
      metadata: { method: parsed.data.method, note: parsed.data.note ?? null, previousStatus: user.phoneVerificationStatus },
    });
    return res.status(200).json({ success: true, data: updated, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ADMIN_PHONE_VERIFICATION_ERROR:", error);
    return errorResponse(req, res, 500, "INTERNAL_SERVER_ERROR", "Could not verify phone number");
  }
}
