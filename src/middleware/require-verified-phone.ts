import type { Request, Response, NextFunction } from "express";
import { prisma } from "../core/prisma";
import { errorResponse } from "../core/api-response";

export async function requireVerifiedPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { phone: true, phoneVerificationStatus: true },
    });
    if (!user?.phone || user.phoneVerificationStatus !== "VERIFIED") {
      return errorResponse(res, req.requestId, 403, "PHONE_VERIFICATION_REQUIRED", "Verify your mobile number before booking or paying");
    }
    return next();
  } catch (error) {
    console.error("PHONE_VERIFICATION_GUARD_ERROR:", error);
    return errorResponse(res, req.requestId, 500, "INTERNAL_SERVER_ERROR", "Could not verify phone status");
  }
}
