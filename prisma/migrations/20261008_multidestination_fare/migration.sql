ALTER TABLE "rides"
  ADD COLUMN "fare_amount" DECIMAL(12,2),
  ADD COLUMN "fare_currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN "fare_breakdown" JSONB;

CREATE TABLE "ride_destinations" (
  "id" UUID NOT NULL,
  "ride_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ride_destinations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ride_destinations_ride_id_sequence_key" ON "ride_destinations"("ride_id","sequence");
CREATE INDEX "ride_destinations_ride_id_sequence_idx" ON "ride_destinations"("ride_id","sequence");

ALTER TABLE "ride_destinations"
  ADD CONSTRAINT "ride_destinations_ride_id_fkey"
  FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
