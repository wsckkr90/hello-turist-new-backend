export type DriverOfferPayload = Record<string, unknown> & {
  status: "OFFERED";
  rideId: string;
};

/** Only time-sensitive driver offers are allowed to fall back to SMS. */
export function isDriverOffer(data: unknown): data is DriverOfferPayload {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  return record.status === "OFFERED" && typeof record.rideId === "string" && record.rideId.trim().length > 0;
}

/** Removes whitespace and all trailing slashes from the operator-configured gateway origin. */
export function normalizeSmsGatewayBaseUrl(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

/** FCM invalid-argument errors can indicate a bad payload; disable a device only for explicit UNREGISTERED responses. */
export function isUnregisteredFcmResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const details = (error as Record<string, unknown>).details;
  if (!Array.isArray(details)) return false;
  return details.some((detail) => {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return false;
    const entry = detail as Record<string, unknown>;
    return typeof entry["@type"] === "string" && entry["@type"].includes("FcmError") && entry.errorCode === "UNREGISTERED";
  });
}
