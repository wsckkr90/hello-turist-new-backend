import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { requireVerifiedPhone } from "../../middleware/require-verified-phone";
import { createPaymentController, createRefundController, createRazorpayOrderController, getPaymentController, listPaymentsController, paymentWebhookController, verifyRazorpayPaymentController } from "./payment.controller";

const router = Router();
router.post("/webhook", paymentWebhookController);
router.use(authMiddleware);
router.post("/razorpay/order", requireVerifiedPhone, idempotencyMiddleware(), createRazorpayOrderController);
router.post("/orders", requireVerifiedPhone, idempotencyMiddleware(), createRazorpayOrderController);
router.post("/razorpay/verify", requireVerifiedPhone, idempotencyMiddleware(), verifyRazorpayPaymentController);
router.post("/:id/verify", requireVerifiedPhone, idempotencyMiddleware(), verifyRazorpayPaymentController);
router.post("/", requireVerifiedPhone, idempotencyMiddleware(), createPaymentController);
router.get("/", listPaymentsController);
router.get("/:id", getPaymentController);
router.post("/:id/refunds", idempotencyMiddleware(), createRefundController);
router.post("/:id/refund", idempotencyMiddleware(), createRefundController);
export default router;
