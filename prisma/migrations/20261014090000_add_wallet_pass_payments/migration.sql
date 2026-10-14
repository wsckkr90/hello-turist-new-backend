CREATE TABLE "wallet_pass_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "razorpay_order_id" VARCHAR(80) NOT NULL,
  "razorpay_payment_id" VARCHAR(80),
  "amount_paise" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "pass_months" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_pass_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_pass_payments_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "wallet_pass_payments_order_unique" UNIQUE ("razorpay_order_id"),
  CONSTRAINT "wallet_pass_payments_payment_unique" UNIQUE ("razorpay_payment_id"),
  CONSTRAINT "wallet_pass_payments_amount_positive" CHECK ("amount_paise" > 0),
  CONSTRAINT "wallet_pass_payments_months_positive" CHECK ("pass_months" > 0)
);
CREATE INDEX "wallet_pass_payments_user_created_idx" ON "wallet_pass_payments"("user_id", "created_at");
CREATE INDEX "wallet_pass_payments_status_created_idx" ON "wallet_pass_payments"("status", "created_at");
