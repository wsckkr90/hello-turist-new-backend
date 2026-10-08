import { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import * as service from "./ride.service";

function rideId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== "string") throw new Error("INVALID_RIDE_ID");
  return id;
}

function handleError(res: Response, requestId: string, error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const map: Record<string, [number, string]> = {
    RIDE_NOT_FOUND: [404, "Ride not found"],
    RIDE_ACCESS_DENIED: [403, "You do not have access to this ride"],
    INVALID_RIDE_ID: [400, "Invalid ride id"],
    INVALID_RIDE_STATE: [409, "Invalid ride state transition"],
    DRIVER_NOT_VERIFIED: [400, "Driver is not verified"],
    DRIVER_ASSIGNMENT_NOT_FOUND: [404, "Driver assignment not found"],
    DRIVER_ASSIGNMENT_NOT_ACCEPTED: [409, "Driver assignment is not accepted"],
    ASSIGNMENT_ACCESS_DENIED: [403, "You do not have access to this assignment"],
    INVALID_ASSIGNMENT_STATE: [409, "Invalid assignment state"],
    DRIVER_NOT_AVAILABLE: [409, "Driver is not available"],
    DRIVER_REQUIRED: [403, "Driver access required"],
    GUIDE_ASSIGNMENT_NOT_FOUND: [404, "Guide assignment not found"],
    ASSIGNMENT_NOT_ACCEPTED: [409, "Assignment is not accepted"],
  };
  const [status, message] = map[code] ?? [500, "Internal server error"];
  return errorResponse(res, requestId, status, code, message);
}

async function transition(req: Request, res: Response, type: "DRIVER_ARRIVING" | "DRIVER_ARRIVED" | "RIDE_STARTED" | "NEAR_DESTINATION" | "RIDE_COMPLETED" | "RECOVERY_STARTED") {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : undefined;
    return successResponse(res, req.requestId, await service.addRideEvent(req.user!.id, rideId(req), { type, payload }));
  } catch (error) {
    return handleError(res, req.requestId, error);
  }
}

export function driverArrivingController(req: Request, res: Response) {
  return transition(req, res, "DRIVER_ARRIVING");
}

export function driverArrivedController(req: Request, res: Response) {
  return transition(req, res, "DRIVER_ARRIVED");
}

export function startRideController(req: Request, res: Response) {
  return transition(req, res, "RIDE_STARTED");
}

export function nearDestinationController(req: Request, res: Response) {
  return transition(req, res, "NEAR_DESTINATION");
}

export function completeRideController(req: Request, res: Response) {
  return transition(req, res, "RIDE_COMPLETED");
}

export function recoverRideController(req: Request, res: Response) {
  return transition(req, res, "RECOVERY_STARTED");
}
