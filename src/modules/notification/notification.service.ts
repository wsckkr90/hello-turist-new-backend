import { Prisma, NotificationType } from "../../generated/prisma/client";
import { prisma } from "../../core/prisma";
import jwt from "jsonwebtoken";
import type { NotificationIdInput } from "./notification.schema";
import { isDriverOffer, isUnregisteredFcmResponse, normalizeSmsGatewayBaseUrl } from "./notification-delivery-policy";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function googleAccessToken() {
  const email = process.env.FCM_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, privateKey, { algorithm: "RS256" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const body = await response.json() as { access_token?: string };
        if (body.access_token) return body.access_token;
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) return null;
    } catch { /* retry transient network failures */ }
    if (attempt < 2) await sleep(250 * (attempt + 1));
  }
  return null;
}

async function sendSmsFallback(userId: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  // SMS is deliberately restricted to time-sensitive driver offers; ordinary notifications must not create SMS cost.
  if (!isDriverOffer(data)) return false;
  const details = data;

  const baseUrl = normalizeSmsGatewayBaseUrl(process.env.SMS_GATEWAY_BASE_URL);
  const apiKey = process.env.SMS_GATEWAY_API_KEY?.trim();
  if (!baseUrl || !apiKey) return false;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user?.phone) return false;

  try {
    const response = await fetch(`${baseUrl}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        phone_number: user.phone,
        message: `${title}: ${body}`,
        request_id: `ride-offer-${details.rideId}-${userId}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("SMS fallback gateway rejected ride offer", { status: response.status, rideId: details.rideId });
      return false;
    }
    return true;
  } catch (error) {
    console.error("SMS fallback failed for ride offer", { rideId: details.rideId, error });
    return false;
  }
}

async function pushToUser(userId: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const token = await googleAccessToken().catch((error) => {
    console.error("FCM access-token creation failed; allowing the configured SMS fallback", error);
    return null;
  });
  if (!projectId || !token) {
    await sendSmsFallback(userId, title, body, data).catch((error) => {
      console.error("SMS fallback setup failed", error);
      return false;
    });
    return;
  }

  const devices = await prisma.$queryRaw<Array<{ fcm_token: string }>>`SELECT fcm_token FROM notification_devices WHERE user_id=${userId}::uuid AND enabled=true`;
  if (devices.length === 0) {
    await sendSmsFallback(userId, title, body, data).catch(() => false);
    return;
  }

  const results = await Promise.all(devices.map(async ({ fcm_token }) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ message: {
            token: fcm_token,
            notification: { title, body },
            data: data && typeof data === "object" ? Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])) : undefined,
            android: { priority: "high" },
          } }),
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) return true;
        if (!response.ok) {
          let responseBody: unknown = null;
          try {
            responseBody = await response.json();
          } catch {
            // Some upstream failures return an empty or non-JSON body.
          }
          if (isUnregisteredFcmResponse(responseBody)) {
            await prisma.$executeRaw`UPDATE notification_devices SET enabled=false,updated_at=NOW() WHERE fcm_token=${fcm_token}`;
            return false;
          }
          if (response.status < 500 && response.status !== 429) return false;
        }
      } catch { /* retry timeout/network errors */ }
      if (attempt < 2) await sleep(300 * (attempt + 1));
    }
    return false;
  }));

  // The in-app notification was saved before delivery. SMS is a best-effort fallback only when every push fails.
  if (!results.some(Boolean)) await sendSmsFallback(userId, title, body, data).catch((error) => {
    console.error("SMS fallback failed", error);
    return false;
  });
}

export async function createNotification(userId: string, input: { type: NotificationType; title: string; body: string; data?: Prisma.InputJsonValue }) {
  const notification = await prisma.notification.create({ data: { userId, type: input.type, title: input.title, body: input.body, data: input.data } });
  void pushToUser(userId, input.title, input.body, input.data).catch((error) => {
    console.error("Notification delivery pipeline failed; in-app notification remains saved", { userId, notificationId: notification.id, error });
  });
  return notification;
}
export async function notifyUser(userId: string, title: string, body: string, data?: Prisma.InputJsonValue) {
  return createNotification(userId, { type: NotificationType.RIDE_UPDATE, title, body, data });
}
