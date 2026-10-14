import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { adminMiddleware } from "../../middleware/admin";
import { walletController,rewardAdController,rewardAdMobSsvController,redeemController,buyMonthlyPassController,registerDeviceController,getWalletConfigController,updateWalletConfigController,createRedeemCodeController,listRedeemCodesController,createMonthlyPassOrderController,listMonthlyPassTiersController,verifyMonthlyPassPaymentController } from "./wallet.controller";
const router=Router();
router.get("/ad-reward/ssv",rewardAdMobSsvController);
router.use(authMiddleware);
router.get("/",walletController);router.post("/ad-reward",rewardAdController);router.post("/redeem",redeemController);router.post("/monthly-pass/purchase",buyMonthlyPassController);router.get("/monthly-pass/tiers",listMonthlyPassTiersController);router.post("/monthly-pass/razorpay/order",createMonthlyPassOrderController);router.post("/monthly-pass/razorpay/verify",verifyMonthlyPassPaymentController);router.post("/devices",registerDeviceController);router.get("/config",adminMiddleware,getWalletConfigController);router.patch("/config",adminMiddleware,updateWalletConfigController);router.post("/redeem-codes",adminMiddleware,createRedeemCodeController);router.get("/redeem-codes",adminMiddleware,listRedeemCodesController);export default router;
