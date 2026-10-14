import type { Request, Response } from "express";
import { getRideSafetyRecordingPolicy, updateRideSafetyRecordingPolicy } from "../ride-safety/recording-policy.service";
import { writeAuditLog } from "./audit.service";

export async function getAdminRideSafetyRecordingPolicy(req: Request, res: Response) {
  try {
    const policy = await getRideSafetyRecordingPolicy();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: policy, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ADMIN_RECORDING_POLICY_READ_FAILED", error);
    return res.status(500).json({
      success: false, data: null,
      error: { code: "RECORDING_POLICY_READ_FAILED", message: "Unable to load recording policy" },
      requestId: req.requestId,
    });
  }
}

export async function updateAdminRideSafetyRecordingPolicy(req: Request, res: Response) {
  try {
    const policy = await updateRideSafetyRecordingPolicy(req.body);
    await writeAuditLog({
      actorUserId: req.user!.id,
      action: "RIDE_SAFETY_RECORDING_POLICY_UPDATED",
      entityType: "APP_SETTING",
      entityId: "RIDE_SAFETY_RECORDING_POLICY",
      metadata: {
        enabled: policy.enabled,
        retentionDays: policy.retentionDays,
        riderConsentRequired: policy.riderConsentRequired,
        providerAcknowledgementRequired: policy.providerAcknowledgementRequired,
      },
      requestId: req.requestId,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: policy, error: null, requestId: req.requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECORDING_POLICY_UPDATE_FAILED";
    if (code === "INVALID_RECORDING_POLICY") {
      return res.status(400).json({
        success: false, data: null,
        error: { code, message: "Retention must be 1–365 days; rider consent and provider acknowledgement cannot be disabled." },
        requestId: req.requestId,
      });
    }
    console.error("ADMIN_RECORDING_POLICY_UPDATE_FAILED", error);
    return res.status(500).json({
      success: false, data: null,
      error: { code: "RECORDING_POLICY_UPDATE_FAILED", message: "Unable to save recording policy" },
      requestId: req.requestId,
    });
  }
}
