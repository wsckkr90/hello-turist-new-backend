import { Request, Response } from "express";
import { writeAuditLog } from "./audit.service";
import { createSupportTeamContact, listSupportTeamContacts, updateSupportTeamContact } from "../support/support-team.service";

function failure(res: Response, req: Request, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, data: null, error: { code, message }, requestId: req.requestId });
}

export async function listAdminSupportTeamContacts(req: Request, res: Response) {
  try {
    const data = await listSupportTeamContacts(true);
    return res.status(200).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    console.error("ADMIN_SUPPORT_CONTACTS_LIST_ERROR:", error);
    return failure(res, req, 500, "SUPPORT_CONTACTS_READ_FAILED", "Unable to load support contacts");
  }
}

export async function createAdminSupportTeamContact(req: Request, res: Response) {
  try {
    const data = await createSupportTeamContact(req.body ?? {});
    await writeAuditLog({ actorUserId: req.user!.id, action: "SUPPORT_CONTACT_CREATED", entityType: "SUPPORT_TEAM_CONTACT", entityId: data.id, metadata: { name: data.name, phone: data.phone, isPrimary: data.isPrimary }, requestId: req.requestId });
    return res.status(201).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_CONTACT_CREATE_FAILED";
    if (code === "INVALID_NAME") return failure(res, req, 400, code, "Name must be 2–80 characters");
    if (code === "INVALID_PHONE") return failure(res, req, 400, code, "Phone must be in international E.164 format, for example +919876543210");
    if (code.includes("support_team_contacts_phone_key") || code.includes("Unique constraint")) return failure(res, req, 409, "PHONE_ALREADY_EXISTS", "This phone number is already in the support team");
    console.error("ADMIN_SUPPORT_CONTACT_CREATE_ERROR:", error);
    return failure(res, req, 500, "SUPPORT_CONTACT_CREATE_FAILED", "Unable to add support contact");
  }
}

export async function updateAdminSupportTeamContact(req: Request, res: Response) {
  try {
    const data = await updateSupportTeamContact(req.params.id, req.body ?? {});
    await writeAuditLog({ actorUserId: req.user!.id, action: "SUPPORT_CONTACT_UPDATED", entityType: "SUPPORT_TEAM_CONTACT", entityId: data.id, metadata: { name: data.name, phone: data.phone, isActive: data.isActive, isPrimary: data.isPrimary }, requestId: req.requestId });
    return res.status(200).json({ success: true, data, error: null, requestId: req.requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_CONTACT_UPDATE_FAILED";
    if (code === "CONTACT_NOT_FOUND") return failure(res, req, 404, code, "Support contact not found");
    if (["INVALID_NAME", "INVALID_PHONE", "INVALID_ACTIVE_STATUS", "INVALID_PRIMARY_STATUS", "INACTIVE_CONTACT_CANNOT_BE_PRIMARY"].includes(code)) return failure(res, req, 400, code, "Invalid support contact details");
    if (code.includes("support_team_contacts_phone_key") || code.includes("Unique constraint")) return failure(res, req, 409, "PHONE_ALREADY_EXISTS", "This phone number is already in the support team");
    console.error("ADMIN_SUPPORT_CONTACT_UPDATE_ERROR:", error);
    return failure(res, req, 500, "SUPPORT_CONTACT_UPDATE_FAILED", "Unable to update support contact");
  }
}
