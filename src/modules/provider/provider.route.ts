import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import {
  createVehicleController,
  deleteVehicleController,
  getDriver,
  getGuide,
  listGuides,
  listVehicleController,
  updateDriver,
  updateGuide,
  updateVehicleController,
  getDriverPayoutAccount,
  updateDriverPayoutAccount,
  listDriverPayouts,
  getGuidePayoutAccount,
  updateGuidePayoutAccount,
  listGuidePayouts,
  getDriverFinance,
  getGuideFinance,
} from "./provider.controller";

const router = Router();
router.use(authMiddleware);

router.get("/driver/profile", getDriver);
router.put("/driver/profile", updateDriver);
router.get("/driver/payout-account", getDriverPayoutAccount);
router.put("/driver/payout-account", updateDriverPayoutAccount);
router.get("/driver/payouts", listDriverPayouts);
router.get("/driver/finance", getDriverFinance);
router.get("/guide/payout-account", getGuidePayoutAccount);
router.put("/guide/payout-account", updateGuidePayoutAccount);
router.get("/guide/payouts", listGuidePayouts);
router.get("/guide/finance", getGuideFinance);
router.get("/guide/profile", getGuide);
router.get("/guides", listGuides);
router.put("/guide/profile", updateGuide);

router.post("/driver/vehicles", createVehicleController);
router.get("/driver/vehicles", listVehicleController);
router.patch("/driver/vehicles/:id", updateVehicleController);
router.delete("/driver/vehicles/:id", deleteVehicleController);

export default router;
