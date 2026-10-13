import { strict as assert } from "node:assert";
import { isDriverOffer, isUnregisteredFcmResponse, normalizeSmsGatewayBaseUrl } from "../src/modules/notification/notification-delivery-policy";

assert.equal(isDriverOffer({ status: "OFFERED", rideId: "ride-123" }), true, "valid driver offers may use SMS fallback");
assert.equal(isDriverOffer({ status: "OFFERED", rideId: "  " }), false, "blank ride identifiers must not trigger SMS");
assert.equal(isDriverOffer({ status: "COMPLETED", rideId: "ride-123" }), false, "ordinary notifications must not trigger SMS");
assert.equal(isDriverOffer(null), false, "missing data must not trigger SMS");

assert.equal(normalizeSmsGatewayBaseUrl("  http://100.64.0.2:8080///  "), "http://100.64.0.2:8080", "gateway origin should trim whitespace and trailing slashes");
assert.equal(normalizeSmsGatewayBaseUrl(undefined), "", "missing gateway configuration should be empty");

const unregistered = { error: { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } };
const invalidArgument = { error: { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "INVALID_ARGUMENT" }] } };
assert.equal(isUnregisteredFcmResponse(unregistered), true, "explicitly unregistered FCM tokens can be disabled");
assert.equal(isUnregisteredFcmResponse(invalidArgument), false, "payload errors must not disable a valid device token");
assert.equal(isUnregisteredFcmResponse({ error: { status: "NOT_FOUND" } }), false, "HTTP status alone is insufficient to disable a device token");
assert.equal(isUnregisteredFcmResponse(null), false, "malformed FCM response bodies must be handled safely");

console.log("Notification delivery policy checks passed");
