export type RideTransitionEvent =
  | "DRIVER_ARRIVING"
  | "DRIVER_ARRIVED"
  | "RIDE_STARTED"
  | "NEAR_DESTINATION"
  | "RIDE_COMPLETED"
  | "INTERRUPTED"
  | "RECOVERY_STARTED";

const transitions: Record<RideTransitionEvent, readonly string[]> = {
  DRIVER_ARRIVING: ["ASSIGNED"],
  DRIVER_ARRIVED: ["DRIVER_ARRIVING"],
  RIDE_STARTED: ["DRIVER_ARRIVED"],
  NEAR_DESTINATION: ["IN_PROGRESS"],
  RIDE_COMPLETED: ["NEAR_DESTINATION", "IN_PROGRESS"],
  INTERRUPTED: ["IN_PROGRESS", "DRIVER_ARRIVING", "DRIVER_ARRIVED"],
  RECOVERY_STARTED: ["INTERRUPTED"],
};

const nextStates: Record<RideTransitionEvent, string> = {
  DRIVER_ARRIVING: "DRIVER_ARRIVING",
  DRIVER_ARRIVED: "DRIVER_ARRIVED",
  RIDE_STARTED: "IN_PROGRESS",
  NEAR_DESTINATION: "NEAR_DESTINATION",
  RIDE_COMPLETED: "COMPLETED",
  INTERRUPTED: "INTERRUPTED",
  RECOVERY_STARTED: "IN_PROGRESS",
};

export function isValidRideTransition(currentState: string, event: string): event is RideTransitionEvent {
  return event in transitions && transitions[event as RideTransitionEvent].includes(currentState);
}

export function nextRideStatus(event: RideTransitionEvent): string {
  return nextStates[event];
}
