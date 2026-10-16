import type { Request, Response } from "express";
import { listOperationalRides, getOperationalRide, assignOperationalRide, assignOperationalGuide, cancelOperationalRide, interruptOperationalRide, recoverOperationalRide } from "./ride-operations.service";
import { writeAuditLog } from "./audit.service";

export async function getOperationalRides(req: Request, res: Response) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const data = await listOperationalRides({ page, limit, status, search });
  return res.json({ success: true, data, error: null, requestId: req.requestId });
}

export async function getOperationalRideById(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const data = await getOperationalRide(id);
  if (!data) return res.status(404).json({ success: false, error: { code: "RIDE_NOT_FOUND", message: "Ride not found" }, requestId: req.requestId });
  return res.json({ success: true, data, error: null, requestId: req.requestId });
}

export async function assignOperationalRideController(req: Request, res: Response) {
  const rideId = typeof req.params.id === "string" ? req.params.id : "";
  const driverId = typeof req.body?.driverId === "string" ? req.body.driverId : "";
  if (!driverId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "driverId is required" }, requestId: req.requestId });
  try {
    const data = await assignOperationalRide(req.user!.id, rideId, driverId);
    await writeAuditLog({ actorUserId: req.user!.id, action: "RIDE_ASSIGNED_BY_ADMIN", entityType: "RIDE", entityId: rideId, metadata: { driverId }, requestId: req.requestId });
    return res.json({ success: true, data, error: null, requestId: req.requestId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "INTERNAL_SERVER_ERROR";
    const status = message === "RIDE_NOT_FOUND" ? 404 : ["DRIVER_NOT_VERIFIED", "DRIVER_NOT_AVAILABLE", "DRIVER_NOT_REQUIRED", "INVALID_RIDE_STATE"].includes(message) ? 409 : 500;
    return res.status(status).json({ success: false, error: { code: message, message }, requestId: req.requestId });
  }
}

export async function assignOperationalGuideController(req: Request, res: Response) {
  const rideId = typeof req.params.id === "string" ? req.params.id : "";
  const guideId = typeof req.body?.guideId === "string" ? req.body.guideId : "";
  if (!guideId) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "guideId is required" },
      requestId: req.requestId,
    });
  }
  try {
    const data = await assignOperationalGuide(req.user!.id, rideId, guideId);
    return res.status(201).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "INTERNAL_SERVER_ERROR";
    const conflictCodes = [
      "RIDE_NOT_FOUND",
      "GUIDE_NOT_REQUIRED",
      "GUIDE_NOT_AVAILABLE",
      "GUIDE_NOT_VERIFIED",
      "GUIDE_ASSIGNMENT_EXISTS",
      "INVALID_RIDE_STATE",
      "RIDE_ALREADY_HAS_GUIDE",
    ];
    const status = message === "RIDE_NOT_FOUND" ? 404 : conflictCodes.includes(message) ? 409 : 500;
    return res.status(status).json({
      success: false,
      error: { code: message, message },
      requestId: req.requestId,
    });
  }
}

export async function interruptOperationalRideController(req: Request, res: Response) {
  const rideId = typeof req.params.id === "string" ? req.params.id : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "Admin intervention";
  if (!reason) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "reason is required" }, requestId: req.requestId });
  try {
    const data = await interruptOperationalRide(rideId, req.user!.id, reason);
    return res.json({ success: true, data, error: null, requestId: req.requestId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "INTERNAL_SERVER_ERROR";
    const status = ["RIDE_NOT_FOUND"].includes(message) ? 404 : ["RIDE_ACCESS_DENIED","INVALID_RIDE_STATE"].includes(message) ? 409 : 500;
    return res.status(status).json({ success: false, error: { code: message, message }, requestId: req.requestId });
  }
}

export async function recoverOperationalRideController(req: Request, res: Response) {
  const rideId = typeof req.params.id === "string" ? req.params.id : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "Admin recovery";
  if (!reason) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "reason is required" }, requestId: req.requestId });
  const driverId = typeof req.body?.driverId === "string" && req.body.driverId.trim() ? req.body.driverId.trim() : undefined;
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : undefined;
  try {
    const data = await recoverOperationalRide(rideId, req.user!.id, reason, driverId, idempotencyKey);
    return res.json({ success: true, data, error: null, requestId: req.requestId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "INTERNAL_SERVER_ERROR";
    const status = ["RIDE_NOT_FOUND"].includes(message) ? 404 : ["RIDE_ACCESS_DENIED","INVALID_RIDE_STATE","DRIVER_NOT_VERIFIED","DRIVER_NOT_AVAILABLE","DRIVER_ALREADY_ASSIGNED","NO_REPLACEMENT_DRIVER_AVAILABLE"].includes(message) ? 409 : 500;
    return res.status(status).json({ success: false, error: { code: message, message }, requestId: req.requestId });
  }
}

export async function cancelOperationalRideController(req: Request, res: Response) {
  const rideId = typeof req.params.id === "string" ? req.params.id : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "Admin intervention";
  try {
    const data = await cancelOperationalRide(rideId, req.user!.id, reason);
    await writeAuditLog({ actorUserId: req.user!.id, action: "RIDE_CANCELLED_BY_ADMIN", entityType: "RIDE", entityId: rideId, metadata: { reason }, requestId: req.requestId });
    return res.json({ success: true, data, error: null, requestId: req.requestId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "INTERNAL_SERVER_ERROR";
    return res.status(message === "RIDE_NOT_FOUND" ? 404 : 409).json({ success: false, error: { code: message, message }, requestId: req.requestId });
  }
}
