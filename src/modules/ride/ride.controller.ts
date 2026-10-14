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
    INVALID_ASSIGNMENT_STATE: [409, "Invalid assignment state"], DRIVER_ASSIGNMENT_NOT_ACCEPTED: [409, "Driver assignment is not accepted"], GUIDE_ASSIGNMENT_NOT_FOUND: [404, "Guide assignment not found"], GUIDE_ASSIGNMENT_NOT_ACCEPTED: [409, "Guide assignment is not accepted"], GUIDE_NOT_VERIFIED: [400, "Guide is not verified"], LOCATION_ASSIGNMENT_NOT_FOUND: [404, "Provider assignment not found"],
    DRIVER_REQUIRED: [403, "Driver access required"], INVALID_RIDE_ID: [400, "Invalid ride id"],
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


/**
 * Authenticated Server-Sent Events endpoint consumed by Android RideLocationStream.
 * It sends the latest location immediately, then streams newly recorded points.
 * Every poll re-checks ride membership, so a removed assignment cannot keep reading.
 */
export async function streamRideLocationsController(req: Request, res: Response) {
  const requestId = req.requestId;
  const userId = req.user!.id;
  let rideId: string;
  let firstLocation: Awaited<ReturnType<typeof service.latestLocationForRideActor>>;
  try {
    rideId = getRideId(req);
    firstLocation = await service.latestLocationForRideActor(userId, rideId);
  } catch (error) {
    return handleError(res, requestId, error);
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  let polling = false;
  let lastLocationId: string | null = null;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  };

  const writeLocation = (location: NonNullable<typeof firstLocation>) => {
    if (closed || location.id === lastLocationId) return;
    const payload = {
      id: location.id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: location.accuracy === null ? null : Number(location.accuracy),
      recordedAt: location.recordedAt.toISOString(),
    };
    res.write(`id: ${location.id}\nevent: location\ndata: ${JSON.stringify(payload)}\n\n`);
    lastLocationId = location.id;
  };

  res.on("close", cleanup);
  req.on("aborted", cleanup);
  if (firstLocation) writeLocation(firstLocation);
  else res.write(": connected; waiting for first location\n\n");

  const configuredInterval = Number(process.env.RIDE_STREAM_POLL_MS || 2000);
  const pollIntervalMs = Number.isFinite(configuredInterval)
    ? Math.min(10_000, Math.max(1_000, configuredInterval))
    : 2000;

  pollTimer = setInterval(() => {
    if (closed || polling) return;
    polling = true;
    void service.latestLocationForRideActor(userId, rideId).then((location) => {
      if (closed) return;
      if (location) writeLocation(location);
    }).catch((error: unknown) => {
      if (closed) return;
      const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
      if (code === "RIDE_NOT_FOUND" || code === "RIDE_ACCESS_DENIED") {
        res.write(`event: stream-error\ndata: ${JSON.stringify({ code })}\n\n`);
        res.end();
        cleanup();
      } else {
        // Keep the stream alive through brief database/network interruptions.
        res.write(": temporary location lookup failure\n\n");
      }
    }).finally(() => { polling = false; });
  }, pollIntervalMs);

  heartbeatTimer = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(": keep-alive\n\n");
  }, 15_000);
}

export async function listLocationsController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.listLocations(req.user!.id, getRideId(req))); } catch (e) { return handleError(res, req.requestId, e); }
}
