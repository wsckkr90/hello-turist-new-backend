ALTER TABLE wallet_pass_payments
  ADD COLUMN tier_id VARCHAR(32) NOT NULL DEFAULT 'legacy',
  ADD COLUMN included_km INTEGER NOT NULL DEFAULT 0;

ALTER TABLE wallet_pass_payments
  ADD CONSTRAINT wallet_pass_payments_included_km_nonnegative CHECK (included_km >= 0);
