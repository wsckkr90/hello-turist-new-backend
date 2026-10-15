import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { adminMiddleware } from "../../middleware/admin";
import { requirePermission } from "../../middleware/rbac";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { redisRateLimit } from "../../middleware/rate-limit";
import { getAccountVerificationRequests, decideAccountVerification } from "./account-verification.controller";

const router = Router();
const admin = [authMiddleware, adminMiddleware] as const;
const mutationLimit = redisRateLimit({ windowSeconds: 60, maxRequests: 60, keyPrefix: "rl:admin-account-verification" });

router.get("/account-verification/requests", ...admin, requirePermission("users.read"), getAccountVerificationRequests);
router.patch("/account-verification/requests/:id", ...admin, requirePermission("users.manage"), mutationLimit, idempotencyMiddleware(), decideAccountVerification);

export default router;
