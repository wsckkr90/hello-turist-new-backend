import type { Request, Response } from "express";
import { getRidePricing, updateRidePricing, type VehicleRate } from "../ride/fare.service";
import { writeAuditLog } from "./audit.service";

const VEHICLE_TYPES = ["CAR", "SUV", "SEDAN", "HATCHBACK", "VAN", "BUS", "OTHER"] as const;

function numberField(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`INVALID_${field}`);
  return parsed;
}

function vehicleRatesField(value: unknown): Partial<Record<(typeof VEHICLE_TYPES)[number], VehicleRate>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_VEHICLE_RATES");
  const result: Partial<Record<(typeof VEHICLE_TYPES)[number], VehicleRate>> = {};
  for (const type of VEHICLE_TYPES) {
    const source = (value as Record<string, unknown>)[type];
    if (source === undefined) continue;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error(`INVALID_${type}_RATE`);
    result[type] = {
      baseFare: numberField((source as Record<string, unknown>).baseFare, `${type}_BASE_FARE`) ?? 0,
      perKm: numberField((source as Record<string, unknown>).perKm, `${type}_PER_KM`) ?? 0,
      minimumFare: numberField((source as Record<string, unknown>).minimumFare, `${type}_MINIMUM_FARE`) ?? 0,
    };
  }
  return result;
}

export async function getRidePricingController(req: Request, res: Response) {
  try {
    return res.status(200).json({ success: true, data: await getRidePricing(), error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ADMIN_PRICING_GET_ERROR:", error);
    return res.status(500).json({ success: false, data: null, error: { code: "PRICING_READ_FAILED", message: "Unable to load ride pricing" }, requestId: req.requestId });
  }
}

export async function updateRidePricingController(req: Request, res: Response) {
  try {
    const data = await updateRidePricing({
      baseFare: numberField(req.body?.baseFare, "BASE_FARE"),
      perKm: numberField(req.body?.perKm, "PER_KM"),
      minimumFare: numberField(req.body?.minimumFare, "MINIMUM_FARE"),
      vehicleRates: vehicleRatesField(req.body?.vehicleRates),
    });
    await writeAuditLog({ actorUserId: req.user!.id, action: "RIDE_PRICING_UPDATED", entityType: "APP_SETTING", metadata: { setting: "RIDE_PRICING", baseFare: data.baseFare, perKm: data.perKm, minimumFare: data.minimumFare, vehicleRates: data.vehicleRates }, requestId: req.requestId });
    return res.status(200).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_RIDE_PRICING";
    return res.status(400).json({ success: false, data: null, error: { code, message: "Invalid ride pricing" }, requestId: req.requestId });
  }
}
