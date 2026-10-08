import { strict as assert } from "node:assert";
import { isValidRideTransition, nextRideStatus } from "../src/modules/ride/ride-transition";

const cases: Array<[string,string,boolean,string?]> = [
  ["ASSIGNED","DRIVER_ARRIVING",true,"DRIVER_ARRIVING"],
  ["DRIVER_ARRIVING","DRIVER_ARRIVED",true,"DRIVER_ARRIVED"],
  ["DRIVER_ARRIVED","RIDE_STARTED",true,"IN_PROGRESS"],
  ["IN_PROGRESS","NEAR_DESTINATION",true,"NEAR_DESTINATION"],
  ["NEAR_DESTINATION","RIDE_COMPLETED",true,"COMPLETED"],
  ["IN_PROGRESS","RIDE_COMPLETED",true,"COMPLETED"],
  ["ASSIGNED","RIDE_STARTED",false],
  ["DRIVER_ARRIVING","RIDE_COMPLETED",false],
  ["COMPLETED","RIDE_STARTED",false],
  ["INTERRUPTED","RECOVERY_STARTED",true,"IN_PROGRESS"],
  ["IN_PROGRESS","RECOVERY_STARTED",false],
  ["CANCELLED","DRIVER_ARRIVING",false],
];

for (const [current, event, valid, next] of cases) {
  assert.equal(isValidRideTransition(current, event), valid, `${current} -> ${event}`);
  if (valid) assert.equal(nextRideStatus(event as Parameters<typeof nextRideStatus>[0]), next);
}

console.log("Ride transition unit checks passed.");
