ALTER TABLE "ride_locations" ADD COLUMN "guide_id" UUID;

ALTER TABLE "ride_locations" ADD CONSTRAINT "ride_locations_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ride_locations_guide_id_idx" ON "ride_locations"("guide_id");
