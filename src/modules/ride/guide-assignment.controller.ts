import type { Request, Response } from "express";
import { errorResponse, successResponse } from "../../core/api-response";
import * as service from "./guide-assignment.service";

function id(req: Request, name: string) {
  const value = req.params[name];
  if (typeof value !== "string") throw new Error("INVALID_ID");
  return value;
}

function handleError(res: Response, requestId: string, error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const map: Record<string, [number, string]> = {
    INVALID_ID: [400, "Invalid identifier"],
    RIDE_NOT_FOUND: [404, "Ride not found"],
    RIDE_ACCESS_DENIED: [403, "You do not have access to this ride"],
    GUIDE_NOT_REQUIRED: [409, "A guide is not required for this service"],
    GUIDE_NOT_AVAILABLE: [409, "Guide is not verified or available"],
    GUIDE_NOT_VERIFIED: [403, "Verified guide access required"],
    GUIDE_ASSIGNMENT_EXISTS: [409, "Guide assignment already exists"],
    GUIDE_ASSIGNMENT_NOT_FOUND: [404, "Guide assignment not found"],
    ASSIGNMENT_ACCESS_DENIED: [403, "You do not have access to this assignment"],
    INVALID_ASSIGNMENT_STATE: [409, "Invalid assignment state"],
    RIDE_ALREADY_HAS_GUIDE: [409, "A guide is already assigned to this ride"],
  };
  const [status, message] = map[code] ?? [500, "Internal server error"];
  return errorResponse(res, requestId, status, code, message);
}

export async function listMyGuideAssignmentsController(req: Request, res: Response) {
  try {
    return successResponse(
      res,
      req.requestId,
      await service.listMyGuideAssignments(req.user!.id)
    );
  } catch (error) {
    return handleError(res, req.requestId, error);
  }
}

export async function listGuideAssignmentsController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.listGuideAssignments(req.user!.id, id(req, "id"))); }
  catch (error) { return handleError(res, req.requestId, error); }
}

export async function offerGuideController(req: Request, res: Response) {
  const guideId = req.body?.guideId;
  if (typeof guideId !== "string") return errorResponse(res, req.requestId, 400, "VALIDATION_ERROR", "guideId is required");
  try { return successResponse(res, req.requestId, await service.searchAndOfferGuide(req.user!.id, id(req, "id"), guideId), 201); }
  catch (error) { return handleError(res, req.requestId, error); }
}

export async function acceptGuideAssignmentController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.acceptGuideAssignment(req.user!.id, id(req, "id"), id(req, "assignmentId"))); }
  catch (error) { return handleError(res, req.requestId, error); }
}

export async function rejectGuideAssignmentController(req: Request, res: Response) {
  try { return successResponse(res, req.requestId, await service.rejectGuideAssignment(req.user!.id, id(req, "id"), id(req, "assignmentId"))); }
  catch (error) { return handleError(res, req.requestId, error); }
}
