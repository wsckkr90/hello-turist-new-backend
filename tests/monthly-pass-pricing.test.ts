import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMonthlyPassAmountPaise, getMonthlyPassTier, parseMonthlyPassTiers } from "../src/modules/wallet/monthly-pass-pricing";

const tiers = JSON.stringify([
  { id: "100km", maxKm: 100, priceInr: 199 },
  { id: "300km", maxKm: 300, priceInr: 399 },
  { id: "500km", maxKm: 500, priceInr: 599 },
]);

test("parses valid distance tiers and sorts by included kilometres", () => {
  assert.deepEqual(parseMonthlyPassTiers(tiers).map(t => t.id), ["100km", "300km", "500km"]);
});
test("selects server-configured price, never a client amount", () => {
  assert.deepEqual(getMonthlyPassTier(tiers, "300km"), { id: "300km", maxKm: 300, priceInr: 399 });
});
test("rejects missing, malformed, duplicate, and invalid tiers", () => {
  assert.throws(() => parseMonthlyPassTiers(undefined), /MONTHLY_PASS_TIERS_NOT_CONFIGURED/);
  assert.throws(() => parseMonthlyPassTiers("{"), /MONTHLY_PASS_TIERS_INVALID/);
  assert.throws(() => parseMonthlyPassTiers(JSON.stringify([{id:"x",maxKm:100,priceInr:99},{id:"y",maxKm:100,priceInr:199}])), /MONTHLY_PASS_TIERS_INVALID/);
  assert.throws(() => parseMonthlyPassTiers(JSON.stringify([{id:"x",maxKm:0,priceInr:99}])), /MONTHLY_PASS_TIERS_INVALID/);
});
test("rejects unknown tier IDs", () => {
  assert.throws(() => getMonthlyPassTier(tiers, "999km"), /MONTHLY_PASS_TIER_NOT_FOUND/);
});

test("prices a route pass from the current normal fare times exactly 30 rides", () => {
  assert.equal(calculateMonthlyPassAmountPaise(25), 75000);
  assert.equal(calculateMonthlyPassAmountPaise(27.5), 82500);
  assert.throws(() => calculateMonthlyPassAmountPaise(0), /MONTHLY_PASS_AMOUNT_INVALID/);
  assert.throws(() => calculateMonthlyPassAmountPaise(25, 20), /MONTHLY_PASS_AMOUNT_INVALID/);
});
