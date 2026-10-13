ALTER TABLE "users"
  ADD COLUMN "phone_verification_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN "phone_verification_method" TEXT;
