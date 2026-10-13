CREATE TABLE "support_team_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_team_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_team_contacts_phone_key" UNIQUE ("phone")
);

CREATE INDEX "support_team_contacts_active_primary_idx"
  ON "support_team_contacts" ("is_active", "is_primary");

CREATE UNIQUE INDEX "support_team_contacts_one_active_primary_idx"
  ON "support_team_contacts" ("is_primary")
  WHERE "is_active" = TRUE AND "is_primary" = TRUE;
