import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../core/prisma";

export type AccountVerificationMethod = "SMS" | "CALL";

export async function createAccountVerificationRequest(userId: string, method: AccountVerificationMethod) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, email: true, phone: true, status: true, phoneVerificationStatus: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!user.phone) throw new Error("PHONE_REQUIRED");
  if (user.status === "DELETED") throw new Error("ACCOUNT_DELETED");

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO "account_verification_requests" ("id", "user_id", "status", "verification_method", "requested_at")
    VALUES (gen_random_uuid(), ${userId}::uuid, 'PENDING', ${method}, CURRENT_TIMESTAMP)
    ON CONFLICT ("user_id") DO UPDATE SET
      "status" = CASE WHEN "account_verification_requests"."status" IN ('APPROVED','REJECTED') THEN 'PENDING' ELSE "account_verification_requests"."status" END,
      "verification_method" = EXCLUDED."verification_method",
      "requested_at" = CASE WHEN "account_verification_requests"."status" IN ('APPROVED','REJECTED') THEN CURRENT_TIMESTAMP ELSE "account_verification_requests"."requested_at" END,
      "reviewed_at" = CASE WHEN "account_verification_requests"."status" IN ('APPROVED','REJECTED') THEN NULL ELSE "account_verification_requests"."reviewed_at" END,
      "rejection_reason" = CASE WHEN "account_verification_requests"."status" IN ('APPROVED','REJECTED') THEN NULL ELSE "account_verification_requests"."rejection_reason" END
    RETURNING "id", "user_id" AS "userId", "status", "verification_method" AS "method", "requested_at" AS "requestedAt", "reviewed_at" AS "reviewedAt", "rejection_reason" AS "rejectionReason"
  `);

  return { ...rows[0], user };
}

export async function getMyAccountVerificationRequest(userId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r."id", r."user_id" AS "userId", r."status", r."verification_method" AS "method", r."requested_at" AS "requestedAt", r."reviewed_at" AS "reviewedAt", r."rejection_reason" AS "rejectionReason"
    FROM "account_verification_requests" r WHERE r."user_id" = ${userId}::uuid
  `);
  return rows[0] ?? null;
}

export async function listAccountVerificationRequests(input: { page: number; limit: number; status?: string }) {
  const offset = (input.page - 1) * input.limit;
  const status = input.status ?? null;
  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r."id", r."user_id" AS "userId", r."status", r."verification_method" AS "method", r."requested_at" AS "requestedAt", r."reviewed_at" AS "reviewedAt", r."rejection_reason" AS "rejectionReason",
           u."name", u."username", u."email", u."phone", u."status" AS "userStatus", u."phone_verification_status" AS "phoneVerificationStatus"
    FROM "account_verification_requests" r
    JOIN "users" u ON u."id" = r."user_id"
    WHERE (${status}::text IS NULL OR r."status" = ${status})
    ORDER BY r."requested_at" DESC LIMIT ${input.limit} OFFSET ${offset}
  `);
  const countRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM "account_verification_requests" r
    WHERE (${status}::text IS NULL OR r."status" = ${status})
  `);
  const total = countRows[0]?.count ?? 0;
  return { items, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
}

export async function decideAccountVerificationRequest(id: string, status: "APPROVED" | "REJECTED", rejectionReason?: string) {
  const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "id", "user_id" AS "userId", "status", "verification_method" AS "method" FROM "account_verification_requests" WHERE "id" = ${id}::uuid
  `);
  if (!existing[0]) throw new Error("REQUEST_NOT_FOUND");
  if (!["PENDING","REJECTED"].includes(existing[0].status)) throw new Error("REQUEST_ALREADY_DECIDED");
  if (status === "REJECTED" && !rejectionReason?.trim()) throw new Error("REJECTION_REASON_REQUIRED");

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.$executeRaw(Prisma.sql`
      UPDATE "account_verification_requests"
      SET "status" = ${status}, "reviewed_at" = ${now}, "rejection_reason" = ${status === "REJECTED" ? rejectionReason!.trim() : null}
      WHERE "id" = ${id}::uuid
    `);
    if (status === "APPROVED") {
      await tx.user.update({
        where: { id: existing[0].userId },
        data: {
          status: "ACTIVE",
          phoneVerificationStatus: "VERIFIED",
          phoneVerifiedAt: now,
          phoneVerificationMethod: existing[0].method,
        },
      });
    }
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT "id", "user_id" AS "userId", "status", "verification_method" AS "method", "requested_at" AS "requestedAt", "reviewed_at" AS "reviewedAt", "rejection_reason" AS "rejectionReason"
      FROM "account_verification_requests" WHERE "id" = ${id}::uuid
    `);
    return rows[0];
  });
  return result;
}
