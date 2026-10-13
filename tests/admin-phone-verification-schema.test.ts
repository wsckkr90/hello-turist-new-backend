import { strict as assert } from "node:assert";
import { adminPhoneVerificationSchema } from "../src/modules/admin/phone-verification.schema";

for (const method of ["SMS", "CALL", "IN_PERSON"] as const) {
  assert.equal(adminPhoneVerificationSchema.safeParse({ method }).success, true, `${method} must be an allowed admin fallback method`);
}
assert.equal(adminPhoneVerificationSchema.safeParse({ method: "FIREBASE" }).success, false, "Firebase is not an admin override method");
assert.equal(adminPhoneVerificationSchema.safeParse({ method: "SMS", note: "x".repeat(501) }).success, false, "Audit note must be limited to 500 characters");
assert.equal(adminPhoneVerificationSchema.safeParse({ method: "EMAIL" }).success, false, "Unsupported verification methods must be rejected");
console.log("Admin phone-verification schema checks passed");
