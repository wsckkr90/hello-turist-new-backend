CREATE TABLE "guide_payout_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK',
    "account_holder_name" TEXT,
    "encrypted_account_number" TEXT,
    "account_number_last4" TEXT,
    "ifsc" TEXT,
    "encrypted_upi_vpa" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guide_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guide_payouts" (
    "id" UUID NOT NULL,
    "guide_id" UUID NOT NULL,
    "ride_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAYX',
    "provider_payout_id" TEXT,
    "failure_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guide_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guide_payout_accounts_user_id_key" ON "guide_payout_accounts"("user_id");
CREATE INDEX "guide_payout_accounts_verification_status_idx" ON "guide_payout_accounts"("verification_status");
CREATE UNIQUE INDEX "guide_payouts_provider_payout_id_key" ON "guide_payouts"("provider_payout_id");
CREATE INDEX "guide_payouts_guide_id_created_at_idx" ON "guide_payouts"("guide_id", "created_at");
CREATE INDEX "guide_payouts_status_created_at_idx" ON "guide_payouts"("status", "created_at");
CREATE INDEX "guide_payouts_ride_id_idx" ON "guide_payouts"("ride_id");
CREATE UNIQUE INDEX "guide_payouts_ride_id_key" ON "guide_payouts"("ride_id");

ALTER TABLE "guide_payout_accounts" ADD CONSTRAINT "guide_payout_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guide_payouts" ADD CONSTRAINT "guide_payouts_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
