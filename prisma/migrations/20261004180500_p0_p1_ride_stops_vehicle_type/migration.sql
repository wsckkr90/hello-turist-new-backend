-- P0/P1: persist multi-destination stops and the rider-selected vehicle category.
ALTER TABLE "rides"
  ADD COLUMN "destinations" JSONB,
  ADD COLUMN "vehicle_type" "VehicleType" NOT NULL DEFAULT 'CAR';

CREATE INDEX "rides_vehicle_type_status_idx" ON "rides"("vehicle_type", "status");
