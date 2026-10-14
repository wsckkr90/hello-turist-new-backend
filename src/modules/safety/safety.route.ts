import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import {
  acceptTrustedContactInvitationController, acknowledgeEmergencyController, createEmergencyIncidentController, createTrustedContactController,
  deleteTrustedContactController, escalateEmergencyController, getEmergencyIncidentController, listTrustedContactsController,
  recordRideHeartbeatController, resolveEmergencyController, safetyOverviewController, shareTripController,
  createRideRecordingConsentController,
} from "./safety.controller";
import { createRecordingAccessUrl, finalizeRideRecording, prepareRideRecordingUpload } from "../ride-safety/recording.service";
import { getRideSafetyRecordingPolicy } from "../ride-safety/recording-policy.service";
import { authenticatedSharedTripRouter } from "./shared-trip.route";

const router = Router();
router.use(authMiddleware);
router.use(authenticatedSharedTripRouter);
router.get("/safety", safetyOverviewController);
router.get("/safety/recording-policy", async (req, res) => {
  try {
    const data = await getRideSafetyRecordingPolicy();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("RIDE_RECORDING_POLICY_READ_FAILED", error);
    return res.status(500).json({
      success: false, data: null,
      error: { code: "RECORDING_POLICY_READ_FAILED", message: "Unable to load recording policy" },
      requestId: req.requestId,
    });
  }
});
router.get("/trusted-contacts", listTrustedContactsController);
router.post("/trusted-contacts/invitations", idempotencyMiddleware(), createTrustedContactController);
router.post("/trusted-contacts/invitations/:id/accept", idempotencyMiddleware(), acceptTrustedContactInvitationController);
router.delete("/trusted-contacts/:id", idempotencyMiddleware(), deleteTrustedContactController);
router.post("/trips/:id/share", idempotencyMiddleware(), shareTripController);
router.post("/emergency/incidents", idempotencyMiddleware(), createEmergencyIncidentController);
router.get("/emergency/incidents/:id", getEmergencyIncidentController);
router.post("/emergency/incidents/:id/acknowledge", idempotencyMiddleware(), acknowledgeEmergencyController);
router.post("/emergency/incidents/:id/escalate", idempotencyMiddleware(), escalateEmergencyController);
router.post("/emergency/incidents/:id/resolve", idempotencyMiddleware(), resolveEmergencyController);
router.post("/rides/:id/heartbeat", recordRideHeartbeatController);
router.post("/rides/:id/recording-consent", idempotencyMiddleware(), createRideRecordingConsentController);

router.post("/rides/:id/recordings/upload-url", idempotencyMiddleware(), async (req, res) => {
  try {
    const data = await prepareRideRecordingUpload(req.user!.id, String(req.params.id), String(req.body?.contentType ?? ""));
    return res.status(200).json({ success: true, data, error: null });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECORDING_UPLOAD_FAILED";
    const status = code === "RIDE_NOT_FOUND" ? 404 : code === "RIDE_ACCESS_DENIED" ? 403 : ["RECORDING_DISABLED_BY_POLICY", "RECORDING_CONSENT_REQUIRED", "RECORDING_RIDER_CONSENT_REQUIRED", "RECORDING_PROVIDER_ACKNOWLEDGEMENT_REQUIRED"].includes(code) ? 409 : 400;
    return res.status(status).json({ success: false, data: null, error: { code, message: code === "RIDE_ACCESS_DENIED" ? "You do not have access to this ride recording" : "Unable to prepare recording upload" }, requestId: req.requestId });
  }
});
router.post("/rides/:id/recordings/complete", idempotencyMiddleware(), async (req, res) => {
  try {
    const data = await finalizeRideRecording(req.user!.id, String(req.params.id), String(req.body?.key ?? ""), String(req.body?.contentType ?? ""), req.body?.bytes === undefined ? undefined : Number(req.body.bytes));
    return res.status(201).json({ success: true, data, error: null });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECORDING_FINALIZE_FAILED";
    const status = code === "RIDE_NOT_FOUND" ? 404 : code === "RIDE_ACCESS_DENIED" ? 403 : code === "RECORDING_CONSENT_REQUIRED" ? 409 : 400;
    return res.status(status).json({ success: false, data: null, error: { code, message: code === "RIDE_ACCESS_DENIED" ? "You do not have access to this ride recording" : "Unable to finalize recording" }, requestId: req.requestId });
  }
});
router.get("/rides/:id/recordings/:recordingId/access", async (req, res) => {
  try {
    const url = await createRecordingAccessUrl(req.user!.id, String(req.params.id), req.params.recordingId);
    return res.status(200).json({ success: true, data: { url }, error: null });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECORDING_ACCESS_DENIED";
    const status = code === "RIDE_NOT_FOUND" || code === "RECORDING_NOT_FOUND" ? 404 : code === "RIDE_ACCESS_DENIED" ? 403 : code === "RECORDING_EXPIRED" ? 410 : 403;
    return res.status(status).json({ success: false, data: null, error: { code, message: code === "RIDE_ACCESS_DENIED" ? "You do not have access to this ride recording" : code === "RECORDING_EXPIRED" ? "This recording has expired" : "Recording access denied" }, requestId: req.requestId });
  }
});

export default router;
