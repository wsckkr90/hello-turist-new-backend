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
import { authMiddleware } from "../../middleware/auth";
import { registerTestDriverController } from "./test-auth.controller";
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

// Every new local account must include a mobile number.
router.post("/register", authAttemptLimit, registerWithPhone);
// Explicitly disabled unless ENABLE_TEST_ENDPOINTS=true and X-Test-Api-Key matches TEST_API_KEY.
router.post("/test/register-driver", registerTestDriverController);
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
export default router;
