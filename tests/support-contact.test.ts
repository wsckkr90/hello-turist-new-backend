import { strict as assert } from "node:assert";
import { getSupportContact } from "../src/modules/support/support-contact";

assert.equal(getSupportContact(undefined), null, "an unconfigured support phone must not be exposed");
assert.equal(getSupportContact(""), null, "an empty support phone must return not configured");
assert.equal(getSupportContact("  "), null, "a whitespace-only support phone must return not configured");
assert.equal(getSupportContact("7095101130"), null, "a phone number without an explicit country code must be rejected");
assert.equal(getSupportContact("not-a-phone"), null, "malformed public numbers must be rejected");
assert.deepEqual(
  getSupportContact(" +917095101130 "),
  { phone: "+917095101130", smsEnabled: true, callEnabled: true },
  "a valid E.164 support phone should be normalized and enable client dialer/SMS actions"
);
assert.equal(getSupportContact("+0123456789"), null, "E.164 phone numbers cannot use zero as the country-code first digit");
console.log("Support-contact configuration checks passed");
