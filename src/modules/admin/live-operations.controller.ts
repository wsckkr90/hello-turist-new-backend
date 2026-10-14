import type { Request, Response } from "express";
import { getAdminLiveRideMonitoring } from "./live-operations.service";

export async function getAdminLiveRideMonitoringController(req: Request, res: Response) {
  try {
    const data = await getAdminLiveRideMonitoring();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ADMIN_LIVE_RIDE_MONITORING_FAILED", error);
    return res.status(500).json({ success: false, data: null, error: { code: "LIVE_MONITORING_FAILED", message: "Unable to load live ride monitoring" }, requestId: req.requestId });
  }
}
