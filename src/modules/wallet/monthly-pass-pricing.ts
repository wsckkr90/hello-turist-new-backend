export type MonthlyPassTier = { id: string; maxKm: number; priceInr: number };

export function parseMonthlyPassTiers(raw: string | undefined): MonthlyPassTier[] {
  if (!raw?.trim()) throw new Error("MONTHLY_PASS_TIERS_NOT_CONFIGURED");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("MONTHLY_PASS_TIERS_INVALID"); }
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw new Error("MONTHLY_PASS_TIERS_INVALID");
  const seen = new Set<string>();
  const tiers = value.map((item): MonthlyPassTier => {
    if (!item || typeof item !== "object") throw new Error("MONTHLY_PASS_TIERS_INVALID");
    const { id, maxKm, priceInr } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(id) ||
        !Number.isSafeInteger(maxKm) || Number(maxKm) <= 0 ||
        !Number.isSafeInteger(priceInr) || Number(priceInr) <= 0 || Number(priceInr) > 1000000 ||
        seen.has(id)) throw new Error("MONTHLY_PASS_TIERS_INVALID");
    seen.add(id);
    return { id, maxKm: Number(maxKm), priceInr: Number(priceInr) };
  });
  tiers.sort((a,b) => a.maxKm - b.maxKm);
  for (let i=1;i<tiers.length;i++) if (tiers[i].maxKm <= tiers[i-1].maxKm) throw new Error("MONTHLY_PASS_TIERS_INVALID");
  return tiers;
}

export function getMonthlyPassTier(raw: string | undefined, tierId: string): MonthlyPassTier {
  const tier = parseMonthlyPassTiers(raw).find(item => item.id === tierId);
  if (!tier) throw new Error("MONTHLY_PASS_TIER_NOT_FOUND");
  return tier;
}

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
