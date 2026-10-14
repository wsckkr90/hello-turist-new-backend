import { prisma } from "../../core/prisma";
import { NotificationType } from "../../generated/prisma/client";
import { createNotification } from "../notification/notification.service";

export async function listVerificationRequests(input: { page: number; limit: number; status?: string; role?: "DRIVER" | "GUIDE" }) {
  const where = { ...(input.status ? { status: input.status as any } : {}), ...(input.role ? { role: input.role } : {}) };
  const [items, total] = await Promise.all([
    prisma.verificationRequest.findMany({ where, include: { user: { select: { id: true, name: true, username: true, email: true } }, steps: true, documents: { select: { id: true, documentType: true, checksum: true, expiryDate: true, verificationStatus: true, createdAt: true, updatedAt: true } }, liveSession: true }, orderBy: { createdAt: "desc" }, skip: (input.page - 1) * input.limit, take: input.limit }),
    prisma.verificationRequest.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
}

export async function getVerificationRequest(id: string) {
  return prisma.verificationRequest.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, username: true, email: true } }, steps: true, documents: { select: { id: true, documentType: true, checksum: true, expiryDate: true, verificationStatus: true, createdAt: true, updatedAt: true } }, liveSession: true } });
}

/** Application-owned verification: admin approval is the authoritative verification event. */
export async function updateVerificationRequest(id: string, status: "VERIFIED" | "REJECTED", reason?: string) {
  const existing = await prisma.verificationRequest.findUnique({ where: { id }, include: { documents: true, liveSession: true } });
  if (!existing) throw new Error("VERIFICATION_REQUEST_NOT_FOUND");
  if (!["PENDING","UNDER_VERIFICATION","RESUBMITTED"].includes(existing.status)) throw new Error("INVALID_VERIFICATION_STATE");

  if (status === "VERIFIED") {

    if (existing.documents.length === 0) throw new Error("DOCUMENTS_REQUIRED");
    if (!existing.liveSession || existing.liveSession.status !== "IN_PROGRESS") throw new Error("LIVE_SESSION_REQUIRED");
    if (existing.documents.some((document) => document.expiryDate && document.expiryDate <= new Date())) throw new Error("DOCUMENT_EXPIRED");
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    if (status === "VERIFIED") {
      await tx.verificationDocument.updateMany({ where: { verificationRequestId: id }, data: { verificationStatus: "VERIFIED" } });
      await tx.verificationLiveSession.update({ where: { verificationRequestId: id }, data: { status: "COMPLETED", completedAt: now } });
      await tx.verificationStep.updateMany({ where: { verificationRequestId: id }, data: { status: "COMPLETED", completedAt: now } });
      await tx.userRoleAssignment.update({ where: { userId_role: { userId: existing.userId, role: existing.role } }, data: { verificationStatus: "VERIFIED" } });
    } else {
      await tx.verificationStep.updateMany({ where: { verificationRequestId: id, step: "REVIEW" }, data: { status: "COMPLETED", completedAt: now } });
      await tx.verificationDocument.updateMany({ where: { verificationRequestId: id }, data: { verificationStatus: "REJECTED" } });
      if (existing.liveSession) {
        await tx.verificationLiveSession.update({ where: { verificationRequestId: id }, data: { status: "FAILED" } });
      }
      await tx.userRoleAssignment.update({ where: { userId_role: { userId: existing.userId, role: existing.role } }, data: { verificationStatus: "REJECTED" } });
    }
    return tx.verificationRequest.update({
      where: { id },
      data: { status: status === "VERIFIED" ? "VERIFIED" : "REJECTED", rejectionReason: status === "REJECTED" ? reason ?? null : null, reviewedAt: now },
      include: { user: { select: { id: true, name: true, username: true, email: true } }, steps: true, documents: { select: { id: true, documentType: true, checksum: true, expiryDate: true, verificationStatus: true, createdAt: true, updatedAt: true } }, liveSession: true },
    });
  });

  try {
    await createNotification(existing.userId, {
      type: NotificationType.VERIFICATION_UPDATE,
      title: status === "VERIFIED" ? "Verification approved" : "Verification rejected",
      body: status === "VERIFIED" ? "Your provider verification has been approved." : "Your provider verification was rejected: " + (reason ?? "No reason provided") + ".",
      data: { event: status === "VERIFIED" ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED", verificationRequestId: id, role: existing.role },
    });
  } catch {
    // Notification delivery must not roll back an already completed verification decision.
  }
  return result;
}
