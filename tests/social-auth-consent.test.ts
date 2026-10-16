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
  ...validPhoneRegistration,
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
  manualVerificationMethod: "SMS",
});
assert.equal(
  manualSmsRegistration.success,
  true,
  "Manual account creation must accept the SMS verification-request flow without an OTP token"
);

const manualCallRegistration = registerWithPhoneSchema.safeParse({
  ...validPhoneRegistration,
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
  manualVerificationMethod: "CALL",
});
assert.equal(
  manualCallRegistration.success,
  true,
  "Manual account creation must accept the Call verification-request flow without an OTP token"
);

const manualRequestWithoutMethod = registerWithPhoneSchema.safeParse({
  ...validPhoneRegistration,
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
});
assert.equal(
  manualRequestWithoutMethod.success,
  false,
  "Manual account creation must specify SMS or CALL"
);

const invalidUsernameRegistration = registerWithPhoneSchema.safeParse({
  ...validPhoneRegistration,
  username: "not a valid username",
  termsAccepted: true,
  termsVersion: "2026-10-13",
  manualVerification: true,
  manualVerificationMethod: "SMS",
});
assert.equal(
  invalidUsernameRegistration.success,
  false,
  "The API must reject usernames containing spaces instead of silently creating a malformed account"
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

console.log("Social auth consent and manual-verification schema regression checks passed");
