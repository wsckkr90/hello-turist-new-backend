import type { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import { calculateFare } from "./fare.service";
import { fareQuoteSchema } from "./fare.schema";

export async function fareQuoteController(req: Request, res: Response) {
  const parsed = fareQuoteSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid fare quote request", parsed.error.flatten());

  try {
    const result = await calculateFare(
      { latitude: parsed.data.pickupLatitude, longitude: parsed.data.pickupLongitude },
      { latitude: parsed.data.dropoffLatitude, longitude: parsed.data.dropoffLongitude },
      parsed.data.destinations,
      parsed.data.vehicleType,
    );
    return successResponse(res, req.requestId, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code.startsWith("GOOGLE_") ? 503 : 400;
    return errorResponse(res, req.requestId, status, code, code === "RIDE_PRICING_CONFIG_MISSING" ? "Ride pricing is not configured" : "Unable to calculate fare");
  }
}
