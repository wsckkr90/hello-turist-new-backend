export function calculateMonthlyPassAmountPaise(normalFareInr: number, includedRides = 30): number {
  if (!Number.isFinite(normalFareInr) || normalFareInr <= 0 ||
      !Number.isSafeInteger(includedRides) || includedRides !== 30) {
    throw new Error("MONTHLY_PASS_AMOUNT_INVALID");
  }
  const amountPaise = Math.round(normalFareInr * includedRides * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > 100000000) {
    throw new Error("MONTHLY_PASS_AMOUNT_INVALID");
  }
  return amountPaise;
}
