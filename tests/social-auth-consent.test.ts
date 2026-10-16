import { strict as assert } from "node:assert";
import { googleAuthSchema, registerWithPhoneSchema } from "../src/modules/auth/social-auth.controller";

const validPhoneRegistration = {
  name: "Test Rider",
  username: "test_rider_qa",
  password: "StrongPassword123",
  phone: "+919876543210",
  idToken: "x".repeat(24),
};

assert.equal(
  registerWithPhoneSchema.safeParse(validPhoneRegistration).success,
  false,
  "Phone registration must reject requests without explicit terms consent"
);

const phoneWithConsent = registerWithPhoneSchema.safeParse({
  ...validPhoneRegistration,
  termsAccepted: true,
  termsVersion: "2026-10-13",
});

assert.equal(phoneWithConsent.success, true, "Phone registration should accept explicit terms consent");

const manualSmsRegistration = registerWithPhoneSchema.safeParse({
  name: "Manual Rider",
  username: "manual_rider_qa",
  password: "StrongPassword123",
  phone: "+919876543210",
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
  manualVerificationMethod: "SMS",
});
assert.equal(
  manualSmsRegistration.success,
  true,
  "Manual SMS registration should not require a Firebase phone token"
);

const manualCallRegistration = registerWithPhoneSchema.safeParse({
  name: "Manual Rider",
  username: "manual_rider_call_qa",
  password: "StrongPassword123",
  phone: "+919876543211",
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
  manualVerificationMethod: "CALL",
});
assert.equal(
  manualCallRegistration.success,
  true,
  "Manual call registration should not require a Firebase phone token"
);

const manualRegistrationWithoutMethod = registerWithPhoneSchema.safeParse({
  name: "Manual Rider",
  username: "manual_rider_missing_method",
  password: "StrongPassword123",
  phone: "+919876543212",
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
});
assert.equal(
  manualRegistrationWithoutMethod.success,
  false,
  "Manual registration must explicitly choose SMS or CALL"
);

const standardRegistrationWithoutToken = registerWithPhoneSchema.safeParse({
  name: "Standard Rider",
  username: "standard_rider_missing_token",
  password: "StrongPassword123",
  phone: "+919876543213",
  termsAccepted: true,
  termsVersion: "2026-10-13",
});
assert.equal(
  standardRegistrationWithoutToken.success,
  false,
  "Standard registration must still require a verified Firebase token"
);

const existingGoogleLogin = googleAuthSchema.safeParse({
  idToken: "x".repeat(24),
});
assert.equal(
  existingGoogleLogin.success,
  true,
  "Google login payload must remain valid without consent fields; consent is enforced only for new account creation"
);

const newGoogleRegistrationWithConsent = googleAuthSchema.safeParse({
  idToken: "x".repeat(24),
  phone: "+919876543210",
  phoneIdToken: "p".repeat(24),
  termsAccepted: true,
  termsVersion: "2026-10-13",
});
assert.equal(
  newGoogleRegistrationWithConsent.success,
  true,
  "Google account creation payload should accept explicit consent and a terms version"
);

const invalidGoogleConsent = googleAuthSchema.safeParse({
  idToken: "x".repeat(24),
  termsAccepted: false,
  termsVersion: "2026-10-13",
});
assert.equal(invalidGoogleConsent.success, false, "Google auth must reject an explicit false consent value");

console.log("Social auth consent schema regression checks passed");
