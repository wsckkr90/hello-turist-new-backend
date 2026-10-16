import { getCloudinary } from "../../core/cloudinary";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../core/prisma";

const ALLOWED_ROLES = ["RIDER", "DRIVER", "GUIDE"] as const;

function profileImageUrl(driverKey?: string | null, guideKey?: string | null) {
  const key = driverKey || guideKey;
  if (!key) return null;
  try { return getCloudinary().url(key, { resource_type: "image", secure: true }); } catch { return null; }
}
export type PeopleRole = (typeof ALLOWED_ROLES)[number];

export async function listPeople(params: { page: number; limit: number; role?: PeopleRole; status?: string; search?: string }) {
  const offset = (params.page - 1) * params.limit;
  const role = params.role ?? null;
  const status = params.status ?? null;
  const search = params.search ? `%${params.search}%` : null;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.status, u.preferred_language AS "preferredLanguage", u.created_at AS "createdAt",
      u.phone_verification_status AS "phoneVerificationStatus", u.phone_verified_at AS "phoneVerifiedAt",
      (NULLIF(BTRIM(u.phone), '') IS NOT NULL) AS "hasPhone",
      dp.profile_image_key AS "driverProfileImageKey", gp.profile_image_key AS "guideProfileImageKey",
      COALESCE(dp.is_available, false) AS "driverAvailable", COALESCE(gp.is_available, false) AS "guideAvailable",
      COALESCE(json_agg(json_build_object('role', r.role, 'verificationStatus', r.verification_status)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
    FROM "users" u LEFT JOIN "user_roles" r ON r.user_id = u.id LEFT JOIN "driver_profiles" dp ON dp.user_id = u.id LEFT JOIN "guide_profiles" gp ON gp.user_id = u.id
    WHERE (${role}::text IS NULL OR r.role::text = ${role})
      AND (${status}::text IS NULL OR u.status::text = ${status})
      AND (${search}::text IS NULL OR u.name ILIKE ${search} OR u.username ILIKE ${search} OR COALESCE(u.email, '') ILIKE ${search} OR COALESCE(u.phone, '') ILIKE ${search})
      AND (r.role::text = ANY(ARRAY['RIDER','DRIVER','GUIDE']))
    GROUP BY u.id, dp.profile_image_key, gp.profile_image_key, dp.is_available, gp.is_available ORDER BY u.created_at DESC LIMIT ${params.limit} OFFSET ${offset}
  `);
  const countRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT COUNT(DISTINCT u.id)::int AS count FROM "users" u LEFT JOIN "user_roles" r ON r.user_id = u.id
    WHERE (${role}::text IS NULL OR r.role::text = ${role})
      AND (${status}::text IS NULL OR u.status::text = ${status})
      AND (${search}::text IS NULL OR u.name ILIKE ${search} OR u.username ILIKE ${search} OR COALESCE(u.email, '') ILIKE ${search} OR COALESCE(u.phone, '') ILIKE ${search})
      AND (r.role::text = ANY(ARRAY['RIDER','DRIVER','GUIDE']))
  `);
  return { items: rows.map((row) => ({ ...row, profileImageUrl: profileImageUrl(row.driverProfileImageKey, row.guideProfileImageKey) })), total: countRows[0]?.count ?? 0, page: params.page, limit: params.limit };
}

export async function getPerson(id: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.status, u.preferred_language AS "preferredLanguage", u.created_at AS "createdAt", u.updated_at AS "updatedAt",
      u.phone_verification_status AS "phoneVerificationStatus", u.phone_verified_at AS "phoneVerifiedAt",
      (NULLIF(BTRIM(u.phone), '') IS NOT NULL) AS "hasPhone",
      dp.profile_image_key AS "driverProfileImageKey", gp.profile_image_key AS "guideProfileImageKey",
      COALESCE(dp.is_available, false) AS "driverAvailable", COALESCE(gp.is_available, false) AS "guideAvailable",
      COALESCE(json_agg(json_build_object('role', r.role, 'verificationStatus', r.verification_status, 'createdAt', r.created_at)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
    FROM "users" u LEFT JOIN "user_roles" r ON r.user_id = u.id LEFT JOIN "driver_profiles" dp ON dp.user_id = u.id LEFT JOIN "guide_profiles" gp ON gp.user_id = u.id WHERE u.id = ${id}::uuid AND r.role::text = ANY(ARRAY['RIDER','DRIVER','GUIDE']) GROUP BY u.id, dp.profile_image_key, gp.profile_image_key, dp.is_available, gp.is_available
  `);
  return rows[0] ? { ...rows[0], profileImageUrl: profileImageUrl(rows[0].driverProfileImageKey, rows[0].guideProfileImageKey) } : null;
}
