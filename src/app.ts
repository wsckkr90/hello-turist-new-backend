import express from "express";
import dotenv from "dotenv";
import { validateProductionIntegrations } from "./config/production";
import { requestIdMiddleware } from "./middleware/request-id";
import authRouter from "./modules/auth/auth.route";
import usersRouter from "./modules/users/users.route";
import adminRouter from "./modules/admin/admin.route";
import adminOperationsRouter from "./modules/admin/admin-operations.route";
import accountVerificationAdminRouter from "./modules/admin/account-verification.route";
import verificationRouter from "./modules/verification/verification.route";
import providerRouter from "./modules/provider/provider.route";
import rideRouter from "./modules/ride/ride.route";
import recoveryRouter from "./modules/recovery/recovery.route";
import paymentRouter from "./modules/payment/payment.route";
import { paymentWebhookController } from "./modules/payment/payment.controller";
import notificationRouter from "./modules/notification/notification.route";
import safetyRouter from "./modules/safety/safety.route";
import { publicSharedTripRouter } from "./modules/safety/shared-trip.route";
import walletRouter from "./modules/wallet/wallet.route";
import savedPlaceRouter from "./modules/saved-place/saved-place.route";
import ratingRouter from "./modules/rating/rating.route";
import supportRouter from "./modules/support/support.route";
import promotionRouter from "./modules/promotion/promotion.route";
import placeRouteRouter from "./modules/place-route/place-route.route";
import placeRouteApiRouter from "./modules/place-route/place-route.api.route";
import trustedContactRouter from "./modules/trusted-contact/trusted-contact.route";
import mediaUploadRouter from "./modules/storage/media-upload.route";
import languageRouter from "./modules/language/language.route";
import discoveryRouter from "./modules/discovery/discovery.route";
import homeContentRouter from "./modules/home-content/home-content.route";
import { getBranding } from "./modules/admin/branding.service";
import { getSupportContact } from "./modules/support/support-contact";
import { errorHandler } from "./middleware/error-handler";
import { securityHeaders } from "./middleware/security";
import { connectRedis, redis } from "./core/redis";
import { prisma } from "./lib/prisma";

dotenv.config();
validateProductionIntegrations();
const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, Idempotency-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
app.use(requestIdMiddleware);
app.get("/health", (_req, res) => res.status(200).json({ success: true, data: { status: "ok" }, error: null, requestId: _req.requestId }));
app.get("/ready", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await connectRedis();
    if (!redis.isReady) throw new Error("Redis is not ready");
    return res.status(200).json({ success: true, data: { status: "ready", database: "ok", redis: "ok" }, error: null, requestId: req.requestId });
  } catch (error) {
    return res.status(503).json({ success: false, data: { status: "not_ready" }, error: { code: "DEPENDENCY_NOT_READY" }, requestId: req.requestId });
  }
});
app.get("/api/v1/branding", async (_req, res, next) => {
  try { return res.json({ success: true, data: await getBranding(), error: null }); }
  catch (error) { return next(error); }
});
app.get("/api/v1/support/contact", (req, res) => {
  const contact = getSupportContact(process.env.ADMIN_SUPPORT_PHONE);
  if (!contact) {
    return res.status(503).json({
      success: false,
      data: null,
      error: { code: "SUPPORT_CONTACT_NOT_CONFIGURED", message: "Support contact is not configured" },
      requestId: req.requestId,
    });
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json({ success: true, data: contact, error: null, requestId: req.requestId });
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/admin", adminOperationsRouter);
app.use("/api/v1/admin", accountVerificationAdminRouter);
app.use("/api/v1/verification", verificationRouter);
app.use("/api/v1/providers", providerRouter);
app.use("/api/v1/rides", recoveryRouter);
app.use("/api/v1/rides", rideRouter);
app.use("/api/v1/payments", paymentRouter);
app.post("/api/v1/webhooks/razorpay", paymentWebhookController);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/wallet", walletRouter);
app.use("/api/v1", publicSharedTripRouter);
app.use("/api/v1", safetyRouter);
app.use("/api/v1/trusted-contacts", trustedContactRouter);
app.use("/api/v1/media", mediaUploadRouter);
app.use("/api/v1/places/saved", savedPlaceRouter);
app.use("/api/v1", ratingRouter);
app.use("/api/v1/support/tickets", supportRouter);
app.use("/api/v1/promotions", promotionRouter);
app.use("/api/v1/maps", placeRouteRouter);
app.use("/api/v1", placeRouteApiRouter);
app.use("/api/v1", languageRouter);
app.use("/api/v1/discovery", discoveryRouter);
app.use("/api/v1/home-banner", homeContentRouter);
app.use(errorHandler);
export default app;
