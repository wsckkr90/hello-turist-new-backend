import { Prisma, NotificationType } from "../../generated/prisma/client";
import { prisma } from "../../core/prisma";
import jwt from "jsonwebtoken";
import type { NotificationIdInput } from "./notification.schema";

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}
export async function getNotification(userId: string, { id }: NotificationIdInput) {
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
  return notification;
}
export async function markNotificationRead(userId: string, { id }: NotificationIdInput) {
  const notification = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
  if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}
export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { updatedCount: result.count };
}
export async function deleteNotification(userId: string, { id }: NotificationIdInput) {
  const notification = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
  if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
  await prisma.notification.delete({ where: { id } });
  return { id };
}

async function googleAccessToken() {
  const email = process.env.FCM_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, privateKey, { algorithm: "RS256" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) return null;
  const body = await response.json() as { access_token?: string };
  return body.access_token ?? null;
}

async function pushToUser(userId: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const token = await googleAccessToken();
  if (!projectId || !token) return;
  const devices = await prisma.$queryRaw<Array<{ fcm_token: string }>>`SELECT fcm_token FROM notification_devices WHERE user_id=${userId}::uuid AND enabled=true`;
  await Promise.all(devices.map(async ({ fcm_token }) => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { token: fcm_token, data: { title, body, ...(data && typeof data === "object" ? Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k,v]) => [k, String(v)])) : {}) }, android: { priority: "high" } } }) });
    if (response.status === 404 || response.status === 400) await prisma.$executeRaw`UPDATE notification_devices SET enabled=false,updated_at=NOW() WHERE fcm_token=${fcm_token}`;
    if (!response.ok) return;
  }));
}

export async function createNotification(userId: string, input: { type: NotificationType; title: string; body: string; data?: Prisma.InputJsonValue }) {
  const notification = await prisma.notification.create({ data: { userId, type: input.type, title: input.title, body: input.body, data: input.data } });
  void pushToUser(userId, input.title, input.body, input.data).catch(() => undefined);
  return notification;
}
export async function notifyUser(userId: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  return createNotification(userId, { type: NotificationType.RIDE_UPDATE, title, body, data });
}
