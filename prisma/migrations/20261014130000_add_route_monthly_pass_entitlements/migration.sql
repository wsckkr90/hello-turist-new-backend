ALTER TABLE wallet_pass_payments
  ADD COLUMN included_rides INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN remaining_rides INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN pickup_address VARCHAR(500),
  ADD COLUMN pickup_latitude DOUBLE PRECISION,
  ADD COLUMN pickup_longitude DOUBLE PRECISION,
  ADD COLUMN dropoff_address VARCHAR(500),
  ADD COLUMN dropoff_latitude DOUBLE PRECISION,
  ADD COLUMN dropoff_longitude DOUBLE PRECISION;

ALTER TABLE wallet_pass_payments
  ADD CONSTRAINT wallet_pass_payments_included_rides_positive CHECK (included_rides > 0),
  ADD CONSTRAINT wallet_pass_payments_remaining_rides_nonnegative CHECK (remaining_rides >= 0),
  ADD CONSTRAINT wallet_pass_payments_route_coordinates_valid CHECK (
    (pickup_latitude IS NULL OR pickup_latitude BETWEEN -90 AND 90) AND
    (dropoff_latitude IS NULL OR dropoff_latitude BETWEEN -90 AND 90) AND
    (pickup_longitude IS NULL OR pickup_longitude BETWEEN -180 AND 180) AND
    (dropoff_longitude IS NULL OR dropoff_longitude BETWEEN -180 AND 180)
  );

ALTER TABLE wallet_monthly_passes
  ADD COLUMN included_rides INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN remaining_rides INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN pickup_address VARCHAR(500),
  ADD COLUMN pickup_latitude DOUBLE PRECISION,
  ADD COLUMN pickup_longitude DOUBLE PRECISION,
  ADD COLUMN dropoff_address VARCHAR(500),
  ADD COLUMN dropoff_latitude DOUBLE PRECISION,
  ADD COLUMN dropoff_longitude DOUBLE PRECISION;

ALTER TABLE wallet_monthly_passes
  ADD CONSTRAINT wallet_monthly_passes_included_rides_positive CHECK (included_rides > 0),
  ADD CONSTRAINT wallet_monthly_passes_remaining_rides_nonnegative CHECK (remaining_rides >= 0),
  ADD CONSTRAINT wallet_monthly_passes_route_coordinates_valid CHECK (
    (pickup_latitude IS NULL OR pickup_latitude BETWEEN -90 AND 90) AND
    (dropoff_latitude IS NULL OR dropoff_latitude BETWEEN -90 AND 90) AND
    (pickup_longitude IS NULL OR pickup_longitude BETWEEN -180 AND 180) AND
    (dropoff_longitude IS NULL OR dropoff_longitude BETWEEN -180 AND 180)
  );
