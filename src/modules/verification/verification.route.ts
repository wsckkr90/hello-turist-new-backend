import { Router } from "express";

import { authMiddleware } from "../../middleware/auth";
import {
  addDocument,
  addLiveSession,
  createRequest,
  getRequest,
  getLatestRequest,
  resubmit,
  submit,
} from "./verification.controller";

const router = Router();

router.use(authMiddleware);

router.post("/requests", createRequest);
router.get("/requests/latest", getLatestRequest);
router.get("/requests/:id", getRequest);
router.post("/requests/:id/documents", addDocument);
router.post("/requests/:id/live-session", addLiveSession);
router.post("/requests/:id/resubmit", resubmit);

// Internal lifecycle action: submit a complete request for admin review.
router.post("/requests/:id/submit", submit);

export default router;
