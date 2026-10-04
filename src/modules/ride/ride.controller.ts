import { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import { assignRideSchema, cancelRideSchema, createRideSchema, locationSchema, rideEventSchema, rideListQuerySchema } from "./ride.schema";
import * as service from "./ride.service";

function getRideId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== "string") throw new Error("INVALID_RIDE_ID");
  return id;
}

function handleError(res: Response, requestId: string, error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const map: Record<string, [number, string]> = {
    RIDE_NOT_FOUND: [404, "Ride not found"], RIDE_ACCESS_DENIED: [403, "You do not have access to this ride"],
    ADMIN_REQUIRED: [403, "Admin access required"], DRIVER_NOT_VERIFIED: [400, "Driver is not verified"],
    INVALID_RIDE_STATE: [409, "Invalid ride state transition"], DRIVER_ASSIGNMENT_NOT_FOUND: [404, "Driver assignment not found"],
    INVALID_ASSIGNMENT_STATE: [409, "Invalid assignment state"], DRIVER_ASSIGNMENT_NOT_ACCEPTED: [409, "Driver assignment is not accepted"],
    DRIVER_REQUIRED: [403, "Driver access required"], INVALID_RIDE_ID: [400, "Invalid ride id"],
    VEHICLE_TYPE_MISMATCH: [409, "Driver does not have the requested vehicle type"],
  };
  const [status, message] = map[code] ?? [500, "Internal server error"];
  return errorResponse(res, requestId, status, code, message);
}

export async function createRideController(req: Request, res: Response) {
  const parsed = createRideSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid ride request", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.createRide(req.user!.id, parsed.data), 201); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function listRidesController(req: Request, res: Response) {
  const parsed = rideListQuerySchema.safeParse(req.query);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.listRides(req.user!.id, parsed.data.status, parsed.data.limit, parsed.data.cursor)); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function getRideController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.getRide(req.user!.id, getRideId(req))); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function cancelRideController(req: Request, res: Response) {
  const parsed = cancelRideSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid cancellation request", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.cancelRide(req.user!.id, getRideId(req), parsed.data)); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function assignRideController(req: Request, res: Response) {
  const parsed = assignRideSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid assignment request", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.assignRide(req.user!.id, getRideId(req), parsed.data), 201); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function acceptRideController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.acceptRide(req.user!.id, getRideId(req))); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function rejectRideController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.rejectRide(req.user!.id, getRideId(req))); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function addLocationController(req: Request, res: Response) {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid location", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.addLocation(req.user!.id, getRideId(req), parsed.data), 201); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function addEventController(req: Request, res: Response) {
  const parsed = rideEventSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "Invalid ride event", parsed.error.flatten());
  try { return successResponse(res, req.requestId, await service.addRideEvent(req.user!.id, getRideId(req), parsed.data)); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function listEventsController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.listEvents(req.user!.id, getRideId(req))); } catch (e) { return handleError(res, req.requestId, e); }
}

export async function listLocationsController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.listLocations(req.user!.id, getRideId(req))); } catch (e) { return handleError(res, req.requestId, e); }
}
