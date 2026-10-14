import { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import { driverProfileSchema, guideProfileSchema, updateVehicleSchema, vehicleSchema } from "./provider.schema";
import * as service from "./provider.service";
import { payoutAccountSchema } from "./payout.schema";
import * as payoutService from "./payout.service";

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function handleError(error: unknown, req: Request, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
  const map: Record<string, [number, string]> = {
    ROLE_NOT_FOUND: [403, "Required provider role is not assigned"],
    DRIVER_PROFILE_REQUIRED: [400, "Create driver profile before adding vehicles"],
    VEHICLE_NOT_FOUND: [404, "Vehicle not found"],
    PAYOUT_ACCOUNT_NOT_READY: [409, "Payout account is not ready"],
    PAYOUT_PROVIDER_NOT_CONFIGURED: [503, "Provider payouts are not enabled yet; payment collection is still available"],
    PAYOUT_DATA_ENCRYPTION_KEY_NOT_CONFIGURED: [503, "Payout data encryption is not configured"],
    PAYOUT_DATA_ENCRYPTION_KEY_INVALID: [503, "Payout data encryption key is invalid"],
    USER_NOT_FOUND: [404, "User not found"],
  };
  const [status, message] = map[code] ?? [500, "Something went wrong"];
  return errorResponse(res, req.requestId, status, code, message);
}

export async function getDriver(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.getDriverProfile(req.user.id)); }
  catch (error) { return handleError(error, req, res); }
}

export async function updateDriver(req: Request, res: Response) {
  const parsed = driverProfileSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid driver profile", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.upsertDriverProfile(req.user.id, parsed.data)); }
  catch (error) { return handleError(error, req, res); }
}

export async function getGuide(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.getGuideProfile(req.user.id)); }
  catch (error) { return handleError(error, req, res); }
}

export async function listGuides(req: Request, res: Response) {
  const serviceCity = typeof req.query.serviceCity === "string" ? req.query.serviceCity.trim() : undefined;
  try { return successResponse(res, req.requestId, await service.listGuides(serviceCity)); }
  catch (error) { return handleError(error, req, res); }
}

export async function updateGuide(req: Request, res: Response) {
  const parsed = guideProfileSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid guide profile", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.upsertGuideProfile(req.user.id, parsed.data)); }
  catch (error) { return handleError(error, req, res); }
}

export async function createVehicleController(req: Request, res: Response) {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid vehicle", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.createVehicle(req.user.id, parsed.data), 201); }
  catch (error) { return handleError(error, req, res); }
}

export async function listVehicleController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.listVehicles(req.user.id)); }
  catch (error) { return handleError(error, req, res); }
}

export async function updateVehicleController(req: Request, res: Response) {
  const parsed = updateVehicleSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid vehicle", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.updateVehicle(req.user.id, param(req, "id"), parsed.data)); }
  catch (error) { return handleError(error, req, res); }
}

export async function deleteVehicleController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.deleteVehicle(req.user.id, param(req, "id"))); }
  catch (error) { return handleError(error, req, res); }
}

export async function getDriverPayoutAccount(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await payoutService.getDriverPayoutAccount(req.user.id)); }
  catch (error) { return handleError(error, req, res); }
}

export async function updateDriverPayoutAccount(req: Request, res: Response) {
  const parsed = payoutAccountSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid payout account", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await payoutService.upsertDriverPayoutAccount(req.user.id, parsed.data)); }
  catch (error) { return handleError(error, req, res); }
}

export async function listDriverPayouts(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await payoutService.listDriverPayouts(req.user.id)); }
  catch (error) { return handleError(error, req, res); }
}
