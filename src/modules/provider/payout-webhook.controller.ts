import crypto from "node:crypto";
import type { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import { applyRazorpayXPayoutWebhook } from "./payout.service";

export async function razorpayXPayoutWebhookController(req: Request, res: Response) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET?.trim();
  const signature = req.header("x-razorpay-signature")?.trim();
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!secret || !signature || !rawBody) {
    return errorResponse(res, req.requestId, 401, "UNAUTHORIZED", "Invalid RazorpayX webhook credentials");
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return errorResponse(res, req.requestId, 401, "UNAUTHORIZED", "Invalid RazorpayX webhook signature");
  }

  const event = typeof req.body?.event === "string" ? req.body.event : "";
  const allowed = new Set([
    "payout.pending",
    "payout.queued",
    "payout.initiated",
    "payout.processed",
    "payout.updated",
    "payout.reversed",
    "payout.failed",
    "payout.rejected",
  ]);
  if (!allowed.has(event)) {
    return successResponse(res, req.requestId, { received: true, ignored: true, event });
  }

  try {
    const data = await applyRazorpayXPayoutWebhook(event, req.body?.payload);
    return successResponse(res, req.requestId, { received: true, event, data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const map: Record<string, [number, string]> = {
      INVALID_RAZORPAYX_PAYOUT_WEBHOOK: [400, "Invalid RazorpayX payout webhook"],
      PAYOUT_NOT_FOUND: [404, "Payout record not found"],
    };
    const [status, message] = map[code] ?? [500, "Unable to process RazorpayX payout webhook"];
    return errorResponse(res, req.requestId, status, code, message);
  }
}
