export type SupportContact = {
  phone: string;
  smsEnabled: true;
  callEnabled: true;
};

/** Returns only a validated public phone number; never invents a fallback number. */
export function getSupportContact(value: string | undefined | null): SupportContact | null {
  const phone = value?.trim() ?? "";
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return { phone, smsEnabled: true, callEnabled: true };
}
