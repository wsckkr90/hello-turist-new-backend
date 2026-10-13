import { prisma } from "../../core/prisma";
import { getSupportContact } from "./support-contact";

export type SupportTeamContact = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicSupportContact = {
  phone: string;
  smsEnabled: true;
  callEnabled: true;
  manualVerificationAvailable: true;
  contacts: Array<Pick<SupportTeamContact, "id" | "name" | "phone" | "isPrimary">>;
};

const phonePattern = /^\+[1-9]\d{7,14}$/;

function validateName(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_NAME");
  const name = value.trim();
  if (name.length < 2 || name.length > 80) throw new Error("INVALID_NAME");
  return name;
}

function validatePhone(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_PHONE");
  const phone = value.trim();
  if (!phonePattern.test(phone)) throw new Error("INVALID_PHONE");
  return phone;
}

function mapContact(row: any): SupportTeamContact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    isActive: row.isActive,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSupportTeamContacts(includeInactive = true): Promise<SupportTeamContact[]> {
  const rows = includeInactive
    ? await prisma.$queryRaw<any[]>`
        SELECT id, name, phone, is_active AS "isActive", is_primary AS "isPrimary",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM support_team_contacts
        ORDER BY is_active DESC, is_primary DESC, name ASC
      `
    : await prisma.$queryRaw<any[]>`
        SELECT id, name, phone, is_active AS "isActive", is_primary AS "isPrimary",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM support_team_contacts WHERE is_active = TRUE
        ORDER BY is_primary DESC, name ASC
      `;
  return rows.map(mapContact);
}

export async function listPublicSupportContacts(envPhone?: string | null): Promise<PublicSupportContact | null> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, name, phone, is_active AS "isActive", is_primary AS "isPrimary",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM support_team_contacts
    WHERE is_active = TRUE
    ORDER BY is_primary DESC, created_at ASC
  `;
  if (rows.length === 0) {
    const fallback = getSupportContact(envPhone);
    return fallback ? { ...fallback, contacts: [] } : null;
  }
  const contacts = rows.map(mapContact);
  const primary = contacts.find((item) => item.isPrimary) ?? contacts[0];
  return {
    phone: primary.phone,
    smsEnabled: true,
    callEnabled: true,
    manualVerificationAvailable: true,
    contacts: contacts.map(({ id, name, phone, isPrimary }) => ({ id, name, phone, isPrimary })),
  };
}

export async function createSupportTeamContact(input: { name: unknown; phone: unknown; isPrimary?: unknown }) {
  const name = validateName(input.name);
  const phone = validatePhone(input.phone);
  if (input.isPrimary !== undefined && typeof input.isPrimary !== "boolean") throw new Error("INVALID_PRIMARY_STATUS");
  const requestedPrimary = input.isPrimary === true;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM support_team_contacts WHERE is_active = TRUE AND is_primary = TRUE LIMIT 1
    `;
    const isPrimary = requestedPrimary || existing.length === 0;
    if (isPrimary) {
      await tx.$executeRaw`UPDATE support_team_contacts SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_primary = TRUE`;
    }
    const rows = await tx.$queryRaw<any[]>`
      INSERT INTO support_team_contacts (id, name, phone, is_active, is_primary, created_at, updated_at)
      VALUES (gen_random_uuid(), ${name}, ${phone}, TRUE, ${isPrimary}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, phone, is_active AS "isActive", is_primary AS "isPrimary",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    return mapContact(rows[0]);
  });
}

export async function updateSupportTeamContact(id: string, input: { name?: unknown; phone?: unknown; isActive?: unknown; isPrimary?: unknown }) {
  const currentRows = await prisma.$queryRaw<any[]>`
    SELECT id, name, phone, is_active AS "isActive", is_primary AS "isPrimary",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM support_team_contacts WHERE id = ${id}::uuid LIMIT 1
  `;
  if (currentRows.length === 0) throw new Error("CONTACT_NOT_FOUND");
  const current = mapContact(currentRows[0]);
  const name = input.name === undefined ? current.name : validateName(input.name);
  const phone = input.phone === undefined ? current.phone : validatePhone(input.phone);
  const isActive = input.isActive === undefined ? current.isActive : input.isActive;
  if (typeof isActive !== "boolean") throw new Error("INVALID_ACTIVE_STATUS");
  if (input.isPrimary !== undefined && typeof input.isPrimary !== "boolean") throw new Error("INVALID_PRIMARY_STATUS");
  const wantsPrimary = input.isPrimary === true;
  if (!isActive && wantsPrimary) throw new Error("INACTIVE_CONTACT_CANNOT_BE_PRIMARY");

  return prisma.$transaction(async (tx) => {
    if (wantsPrimary) {
      await tx.$executeRaw`UPDATE support_team_contacts SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_primary = TRUE`;
    }
    const shouldRemainPrimary = input.isPrimary === undefined && current.isPrimary && isActive;
    const isPrimary = wantsPrimary || shouldRemainPrimary;
    const rows = await tx.$queryRaw<any[]>`
      UPDATE support_team_contacts
      SET name = ${name}, phone = ${phone}, is_active = ${isActive}, is_primary = ${isPrimary}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}::uuid
      RETURNING id, name, phone, is_active AS "isActive", is_primary AS "isPrimary",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const updated = mapContact(rows[0]);
    const primaryRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM support_team_contacts WHERE is_active = TRUE AND is_primary = TRUE LIMIT 1
    `;
    if (primaryRows.length === 0) {
      const next = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM support_team_contacts WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1
      `;
      if (next.length > 0) {
        await tx.$executeRaw`UPDATE support_team_contacts SET is_primary = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ${next[0].id}::uuid`;
      }
    }
    return updated;
  });
}
