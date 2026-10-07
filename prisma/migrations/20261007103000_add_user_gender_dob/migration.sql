ALTER TABLE "users" ADD COLUMN "date_of_birth" DATE;
ALTER TABLE "users" ADD COLUMN "gender" TEXT;
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');
ALTER TABLE "users" ALTER COLUMN "gender" TYPE "Gender" USING "gender"::"Gender";
