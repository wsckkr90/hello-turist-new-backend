import type { Request, Response } from "express";
import { errorResponse } from "../../core/api-response";

/**
 * Provider payouts are intentionally disabled until a payout provider/process
 * is explicitly configured. Rider collection continues through the Razorpay
 * payment webhook in the payment module.
 */
export async function razorpayXPayoutWebhookController(req: Request, res: Response) {
  return errorResponse(
    res,
    req.requestId,
    410,
    "PAYOUT_PROVIDER_NOT_CONFIGURED",
    "Provider payouts are not enabled. Rider payments continue through the Razorpay payment webhook.",
  );
}
