import type { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import { calculateFare } from "./fare.service";

function coordinate(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`INVALID_${name}`);
  return parsed;
}

export async function fareQuoteController(req: Request, res: Response) {
  try {
    const origin = {
      latitude: coordinate(req.body?.pickupLatitude, "PICKUP_LATITUDE"),
      longitude: coordinate(req.body?.pickupLongitude, "PICKUP_LONGITUDE"),
    };
    const destination = {
      latitude: coordinate(req.body?.dropoffLatitude, "DROPOFF_LATITUDE"),
      longitude: coordinate(req.body?.dropoffLongitude, "DROPOFF_LONGITUDE"),
    };
    const rawStops = req.body?.destinations ?? [];
    if (!Array.isArray(rawStops) || rawStops.length > 8) {
      return errorResponse(res, req.requestId, 400, "INVALID_DESTINATIONS", "Destinations must be an array of at most 8 stops");
    }
    const stops = rawStops.map((stop: unknown, index: number) => {
      if (!stop || typeof stop !== "object") throw new Error(`INVALID_DESTINATION_${index + 1}`);
      const value = stop as Record<string, unknown>;
      const latitude = coordinate(value.latitude, `DESTINATION_${index + 1}_LATITUDE`);
      const longitude = coordinate(value.longitude, `DESTINATION_${index + 1}_LONGITUDE`);
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("INVALID_COORDINATES");
      return { latitude, longitude };
    });
    if (Math.abs(origin.latitude) > 90 || Math.abs(destination.latitude) > 90 || Math.abs(origin.longitude) > 180 || Math.abs(destination.longitude) > 180) {
      return errorResponse(res, req.requestId, 400, "INVALID_COORDINATES", "Invalid coordinates");
    }
    return successResponse(res, req.requestId, await calculateFare(origin, destination, stops));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "RIDE_PRICING_CONFIG_MISSING" || code.startsWith("GOOGLE_") ? 503 : 400;
    return errorResponse(res, req.requestId, status, code, code === "RIDE_PRICING_CONFIG_MISSING" ? "Ride pricing is not configured" : "Unable to calculate fare");
  }
}
