CREATE TABLE "driver_payout_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK',
    "account_holder_name" TEXT,
    "encrypted_account_number" TEXT,
    "account_number_last4" TEXT,
    "ifsc" TEXT,
    "encrypted_upi_vpa" TEXT,
    "razorpay_contact_id" TEXT,
    "razorpay_fund_account_id" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "driver_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_payouts" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
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
    CONSTRAINT "driver_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_payout_accounts_user_id_key" ON "driver_payout_accounts"("user_id");
CREATE INDEX "driver_payout_accounts_verification_status_idx" ON "driver_payout_accounts"("verification_status");
CREATE UNIQUE INDEX "driver_payouts_provider_payout_id_key" ON "driver_payouts"("provider_payout_id");
CREATE INDEX "driver_payouts_driver_id_created_at_idx" ON "driver_payouts"("driver_id", "created_at");
CREATE INDEX "driver_payouts_status_created_at_idx" ON "driver_payouts"("status", "created_at");
CREATE INDEX "driver_payouts_ride_id_idx" ON "driver_payouts"("ride_id");

ALTER TABLE "driver_payout_accounts" ADD CONSTRAINT "driver_payout_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
