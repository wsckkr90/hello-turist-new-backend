import crypto from "node:crypto";
import { prisma } from "../../core/prisma";
import { calculateMonthlyPassAmountPaise } from "./monthly-pass-pricing";
import { calculateFare } from "../ride/fare.service";

function config() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new Error("RAZORPAY_NOT_CONFIGURED");
  return { keyId, keySecret };
}

async function razorpay(path: string, init: RequestInit = {}) {
  const c = config();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64")}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(response.status === 401 ? "RAZORPAY_AUTH_FAILED" : "RAZORPAY_REQUEST_FAILED");
  return body;
}

export type MonthlyPassRoute = {
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
};

export async function createMonthlyPassOrder(userId: string, route: MonthlyPassRoute) {
  const c = config();
  const fare = await calculateFare(
    { latitude: route.pickupLatitude, longitude: route.pickupLongitude },
    { latitude: route.dropoffLatitude, longitude: route.dropoffLongitude },
  );
  if (!Number.isFinite(fare.totalFare) || fare.totalFare <= 0) throw new Error("MONTHLY_PASS_FARE_INVALID");
  const farePerRideInr = fare.totalFare;
  const includedRides = 30;
  const amountPaise = calculateMonthlyPassAmountPaise(farePerRideInr, includedRides);
  const order = await razorpay("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `pass_${crypto.randomUUID()}`.slice(0, 40),
      notes: {
        userId,
        product: "HELLO_KURUKSHETRA_MONTHLY_PASS",
        passMonths: "1",
        includedRides: String(includedRides),
        farePerRideInr: String(farePerRideInr),
        pickupAddress: route.pickupAddress,
        pickupLatitude: String(route.pickupLatitude),
        pickupLongitude: String(route.pickupLongitude),
        dropoffAddress: route.dropoffAddress,
        dropoffLatitude: String(route.dropoffLatitude),
        dropoffLongitude: String(route.dropoffLongitude),
      },
    }),
  });
  if (!order?.id || Number(order.amount) !== amountPaise || order.currency !== "INR") throw new Error("RAZORPAY_ORDER_INVALID");
  await prisma.$executeRaw`INSERT INTO wallet_pass_payments(user_id,razorpay_order_id,amount_paise,currency,status,pass_months,included_rides,remaining_rides,pickup_address,pickup_latitude,pickup_longitude,dropoff_address,dropoff_latitude,dropoff_longitude) VALUES(${userId}::uuid,${order.id},${amountPaise},'INR','PENDING',1,${includedRides},${includedRides},${route.pickupAddress},${route.pickupLatitude},${route.pickupLongitude},${route.dropoffAddress},${route.dropoffLatitude},${route.dropoffLongitude})`;
  return {
    keyId: c.keyId,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    passMonths: 1,
    includedRides,
    farePerRideInr,
    totalFareInr: amountPaise / 100,
    route: {
      pickupAddress: route.pickupAddress,
      pickupLatitude: route.pickupLatitude,
      pickupLongitude: route.pickupLongitude,
      dropoffAddress: route.dropoffAddress,
      dropoffLatitude: route.dropoffLatitude,
      dropoffLongitude: route.dropoffLongitude,
    },
  };
}

async function activateCapturedPass(orderId: string, paymentId: string, amountPaise: number) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{id:string;user_id:string;amount_paise:number;status:string;pass_months:number;included_rides:number;remaining_rides:number;pickup_address:string;pickup_latitude:number;pickup_longitude:number;dropoff_address:string;dropoff_latitude:number;dropoff_longitude:number}>>`SELECT id,user_id,amount_paise,status,pass_months,included_rides,remaining_rides,pickup_address,pickup_latitude,pickup_longitude,dropoff_address,dropoff_latitude,dropoff_longitude FROM wallet_pass_payments WHERE razorpay_order_id=${orderId} FOR UPDATE`;
    const p = rows[0];
    if (!p) throw new Error("MONTHLY_PASS_ORDER_NOT_FOUND");
    if (Number(p.amount_paise) !== amountPaise) throw new Error("PAYMENT_AMOUNT_MISMATCH");
    if (p.status === "CAPTURED") return { activated: true, alreadyActivated: true };
    if (p.status !== "PENDING") throw new Error("MONTHLY_PASS_PAYMENT_NOT_PENDING");
    const now = new Date();
    const expiry = new Date(now);
    expiry.setMonth(expiry.getMonth() + p.pass_months);
    const terms = `Purchased using Razorpay; route=${p.pickup_address} to ${p.dropoff_address}; includedRides=${p.included_rides}; farePerRide=calculated by current ride pricing`;
    const codeId = (await tx.$queryRaw<Array<{id:string}>>`INSERT INTO wallet_redeem_codes(code,type,pass_months,terms,redeemed_by,redeemed_at) VALUES(${`RP-${orderId}`},'MONTHLY_PASS',${p.pass_months},${terms},${p.user_id}::uuid,${now}) RETURNING id`)[0].id;
    await tx.$executeRaw`INSERT INTO wallet_monthly_passes(user_id,code_id,starts_at,expires_at,included_rides,remaining_rides,pickup_address,pickup_latitude,pickup_longitude,dropoff_address,dropoff_latitude,dropoff_longitude) VALUES(${p.user_id}::uuid,${codeId}::uuid,${now},${expiry},${p.included_rides},${p.remaining_rides},${p.pickup_address},${p.pickup_latitude},${p.pickup_longitude},${p.dropoff_address},${p.dropoff_latitude},${p.dropoff_longitude})`;
    await tx.$executeRaw`UPDATE wallet_pass_payments SET razorpay_payment_id=${paymentId},status='CAPTURED',updated_at=NOW() WHERE id=${p.id}::uuid`;
    await tx.notification.create({ data: { userId: p.user_id, type: "PAYMENT_UPDATE", title: "Monthly pass activated", body: `Your route-based monthly pass is active with ${p.included_rides} rides for one month.`, data: { event: "MONTHLY_PASS_ACTIVATED", orderId, includedRides: p.included_rides, pickupAddress: p.pickup_address, dropoffAddress: p.dropoff_address } } });
    return { activated: true, alreadyActivated: false, startsAt: now, expiresAt: expiry, includedRides: p.included_rides, remainingRides: p.remaining_rides, pickupAddress: p.pickup_address, dropoffAddress: p.dropoff_address };
  });
}

export async function verifyMonthlyPassPayment(userId: string, input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  const c = config();
  const rows = await prisma.$queryRaw<Array<{user_id:string;amount_paise:number;status:string}>>`SELECT user_id,amount_paise,status FROM wallet_pass_payments WHERE razorpay_order_id=${input.razorpayOrderId}`;
  const order = rows[0];
  if (!order) throw new Error("MONTHLY_PASS_ORDER_NOT_FOUND");
  if (order.user_id !== userId) throw new Error("FORBIDDEN");
  const expected = crypto.createHmac("sha256", c.keySecret).update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`).digest("hex");
  const actual = Buffer.from(input.razorpaySignature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) throw new Error("RAZORPAY_SIGNATURE_INVALID");
  const payment = await razorpay(`/payments/${encodeURIComponent(input.razorpayPaymentId)}`);
  if (payment.order_id !== input.razorpayOrderId || Number(payment.amount) !== Number(order.amount_paise) || payment.currency !== "INR") throw new Error("PAYMENT_AMOUNT_MISMATCH");
  if (String(payment.status).toLowerCase() !== "captured") throw new Error("PAYMENT_NOT_SUCCESSFUL");
  return activateCapturedPass(input.razorpayOrderId, input.razorpayPaymentId, Number(payment.amount));
}

export async function applyMonthlyPassPaymentWebhook(event: string, payment: any) {
  const orderId = payment?.order_id;
  const paymentId = payment?.id;
  if (!orderId || !paymentId) return false;
  const exists = await prisma.$queryRaw<Array<{id:string;status:string;amount_paise:number}>>`SELECT id,status,amount_paise FROM wallet_pass_payments WHERE razorpay_order_id=${String(orderId)}`;
  if (!exists[0]) return false;
  if (event === "payment.captured") {
    if (String(payment.status).toLowerCase() !== "captured") throw new Error("PAYMENT_NOT_SUCCESSFUL");
    if (String(payment.currency ?? "").toUpperCase() !== "INR") throw new Error("PAYMENT_AMOUNT_MISMATCH");
    await activateCapturedPass(String(orderId), String(paymentId), Number(payment.amount));
  } else if (event === "payment.failed") {
    await prisma.$executeRaw`UPDATE wallet_pass_payments SET status='FAILED',updated_at=NOW() WHERE razorpay_order_id=${String(orderId)} AND status='PENDING'`;
  }
  return true;
}
