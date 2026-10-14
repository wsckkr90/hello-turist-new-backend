import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMonthlyPassAmountPaise } from "../src/modules/wallet/monthly-pass-pricing";

test("prices the route monthly pass from normal fare times exactly 30 rides", () => {
  assert.equal(calculateMonthlyPassAmountPaise(25), 75000);
  assert.equal(calculateMonthlyPassAmountPaise(27.5), 82500);
  assert.throws(() => calculateMonthlyPassAmountPaise(0), /MONTHLY_PASS_AMOUNT_INVALID/);
  assert.throws(() => calculateMonthlyPassAmountPaise(-1), /MONTHLY_PASS_AMOUNT_INVALID/);
  assert.throws(() => calculateMonthlyPassAmountPaise(25, 20), /MONTHLY_PASS_AMOUNT_INVALID/);
});
