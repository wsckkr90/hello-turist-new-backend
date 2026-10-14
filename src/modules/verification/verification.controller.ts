import { Request, Response } from "express";
import { z } from "zod";
import { addLiveSessionSchema, addVerificationDocumentSchema, createVerificationRequestSchema } from "./verification.schema";
import { addVerificationDocument, createOrUpdateLiveSession, createVerificationRequest, getLatestVerificationRequest, getVerificationRequest, resubmitVerification, submitVerificationForReview } from "./verification.service";

function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function sendError(res: Response, req: Request, status: number, code: string, message: string, details?: unknown) { return res.status(status).json({ success: false, data: null, error: { code, message, ...(details !== undefined ? { details } : {}) }, requestId: req.requestId }); }
function handleServiceError(error: unknown, req: Request, res: Response) {
  if (!(error instanceof Error)) return sendError(res, req, 500, "INTERNAL_SERVER_ERROR", "Something went wrong");
  const map: Record<string, [number, string]> = {
    INVALID_ROLE: [400, "Only DRIVER or GUIDE roles can be verified"], ROLE_NOT_FOUND: [404, "Requested provider role not found"], ROLE_ALREADY_VERIFIED: [409, "Role is already verified"], VERIFICATION_REQUEST_EXISTS: [409, "An active verification request already exists"], VERIFICATION_REQUEST_NOT_FOUND: [404, "Verification request not found"], VERIFICATION_REQUEST_LOCKED: [409, "Verification request cannot be changed in its current state"], RESUBMISSION_NOT_ALLOWED: [409, "Only rejected verification requests can be resubmitted"], PROFILE_REQUIRED: [400, "Complete Driver/Guide profile is required before submission"], DOCUMENTS_REQUIRED: [400, "At least one verification document is required"], LIVE_SESSION_REQUIRED: [400, "A completed live verification session is required"], DOCUMENT_EXPIRED: [400, "Verification documents must not be expired"], INVALID_DOCUMENT_OBJECT_KEY: [400, "Document must be uploaded to your private verification folder"],
  };
  const mapped = map[error.message];
  if (mapped) return sendError(res, req, mapped[0], error.message, mapped[1]);
  console.error("VERIFICATION_ERROR:", error);
  return sendError(res, req, 500, "INTERNAL_SERVER_ERROR", "Something went wrong");
}

export async function createRequest(req: Request, res: Response) { const parsed = createVerificationRequestSchema.safeParse(req.body); if (!parsed.success) return sendError(res, req, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()); try { return res.status(201).json({ success: true, data: await createVerificationRequest(req.user.id, parsed.data.role), error: null, requestId: req.requestId }); } catch (error) { return handleServiceError(error, req, res); } }
export async function getRequest(req: Request, res: Response) { const requestId = param(req.params.id); if (!requestId) return sendError(res, req, 400, "INVALID_REQUEST", "Verification request id is required"); try { return res.status(200).json({ success: true, data: await getVerificationRequest(req.user.id, requestId), error: null, requestId: req.requestId }); } catch (error) { return handleServiceError(error, req, res); } }
export async function getLatestRequest(req: Request, res: Response) {
  const role = z.enum(["DRIVER", "GUIDE"]).safeParse(String(req.query.role ?? "").toUpperCase());
  if (!role.success) return sendError(res, req, 400, "INVALID_ROLE", "Role must be DRIVER or GUIDE");
  try {
    return res.status(200).json({
      success: true,
      data: await getLatestVerificationRequest(req.user.id, role.data),
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    return handleServiceError(error, req, res);
  }
}
export async function addDocument(req: Request, res: Response) { const requestId = param(req.params.id); if (!requestId) return sendError(res, req, 400, "INVALID_REQUEST", "Verification request id is required"); const parsed = addVerificationDocumentSchema.safeParse(req.body); if (!parsed.success) return sendError(res, req, 400, "VALIDATION_ERROR", "Invalid document data", parsed.error.flatten()); try { return res.status(201).json({ success: true, data: await addVerificationDocument(req.user.id, requestId, parsed.data), error: null, requestId: req.requestId }); } catch (error) { return handleServiceError(error, req, res); } }
export async function addLiveSession(req: Request, res: Response) { const requestId = param(req.params.id); if (!requestId) return sendError(res, req, 400, "INVALID_REQUEST", "Verification request id is required"); const parsed = addLiveSessionSchema.safeParse(req.body); if (!parsed.success) return sendError(res, req, 400, "VALIDATION_ERROR", "Invalid live session data", parsed.error.flatten()); try { return res.status(200).json({ success: true, data: await createOrUpdateLiveSession(req.user.id, requestId, parsed.data), error: null, requestId: req.requestId }); } catch (error) { return handleServiceError(error, req, res); } }
export async function resubmit(req: Request, res: Response) { const requestId = param(req.params.id); if (!requestId) return sendError(res, req, 400, "INVALID_REQUEST", "Verification request id is required"); try { return res.status(200).json({ success: true, data: await resubmitVerification(req.user.id, requestId), error: null, requestId: req.requestId }); } catch (error) { return handleServiceError(error, req, res); } }
export async function submit(req: Request, res: Response) { const requestId = param(req.params.id); if (!requestId) return sendError(res, req, 400, "INVALID_REQUEST", "Verification request id is required"); try { return res.status(200).json({ success: true, data: await submitVerificationForReview(req.user.id, requestId), error: null, requestId: req.requestId }); } catch (error) { return handleServiceError(error, req, res); } }
