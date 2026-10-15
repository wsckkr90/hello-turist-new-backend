CREATE TABLE "account_verification_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "verification_method" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  CONSTRAINT "account_verification_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "account_verification_requests_user_id_key" ON "account_verification_requests"("user_id");
CREATE INDEX "account_verification_requests_status_requested_at_idx" ON "account_verification_requests"("status", "requested_at");
