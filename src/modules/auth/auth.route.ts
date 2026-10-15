import { Router } from "express";
import {
  login,
  refresh,
  logout,
  logoutAll,
  deleteAccount,
} from "./auth.controller";
import {
  registerWithPhone,
  googleAuth,
} from "./social-auth.controller";
import { requestOtpController, verifyOtpController, firebasePhoneController } from "./otp.controller";
import { requestAccountVerification, getAccountVerificationStatus } from "./account-verification.controller";
import { authMiddleware } from "../../middleware/auth";
import { redisRateLimit } from "../../middleware/rate-limit";

const router = Router();

const authAttemptLimit = redisRateLimit({
  windowSeconds: 15 * 60,
  maxRequests: 10,
  keyPrefix: "rl:auth",
});

const refreshLimit = redisRateLimit({
  windowSeconds: 15 * 60,
  maxRequests: 30,
  keyPrefix: "rl:refresh",
});

const otpRequestLimit = redisRateLimit({
  windowSeconds: 15 * 60,
  maxRequests: 5,
  keyPrefix: "rl:otp-request",
});

const otpVerifyLimit = redisRateLimit({
  windowSeconds: 15 * 60,
  maxRequests: 10,
  keyPrefix: "rl:otp-verify",
});

const accountVerificationLimit = redisRateLimit({
  windowSeconds: 15 * 60,
  maxRequests: 3,
  keyPrefix: "rl:account-verification",
});

// Every new local account must include a mobile number.
router.post("/register", authAttemptLimit, registerWithPhone);
// Google account creation/login requires a mobile number before a backend session is issued.
router.post("/google", authAttemptLimit, googleAuth);
router.post("/otp/request", otpRequestLimit, requestOtpController);
router.post("/otp/verify", otpVerifyLimit, verifyOtpController);
// Android compatibility: Firebase Phone Auth token -> application session.
router.post("/firebase/phone", otpVerifyLimit, firebasePhoneController);
router.post("/login", authAttemptLimit, login);
router.post("/refresh", refreshLimit, refresh);
router.post("/logout", authMiddleware, logout);
router.post("/logout-all", authMiddleware, logoutAll);
router.delete("/account", authMiddleware, deleteAccount);
// User-controlled request: the selected SMS/CALL method is persisted for admin review.
router.post("/account-verification/request", authMiddleware, accountVerificationLimit, requestAccountVerification);
router.get("/account-verification/status", authMiddleware, getAccountVerificationStatus);
export default router;
