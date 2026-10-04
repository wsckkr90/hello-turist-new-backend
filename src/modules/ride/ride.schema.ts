import { z } from "zod";

export const vehicleTypeSchema = z.enum(["CAR", "SUV", "SEDAN", "HATCHBACK", "VAN", "BUS", "OTHER"]);

export const routeStopSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const coordinate = z.number().min(-180).max(180);

export const createRideSchema = z.object({
  pickupAddress: z.string().trim().min(2).max(500),
  pickupLatitude: coordinate.refine((v) => v >= -90 && v <= 90, "Invalid latitude"),
  pickupLongitude: coordinate,
  dropoffAddress: z.string().trim().min(2).max(500),
  dropoffLatitude: coordinate.refine((v) => v >= -90 && v <= 90, "Invalid latitude"),
  dropoffLongitude: coordinate,
  destinations: z.array(routeStopSchema).max(8).default([]),
  vehicleType: vehicleTypeSchema.default("CAR"),
  serviceType: z.enum(["RIDE_ONLY", "GUIDE_ONLY", "RIDE_AND_GUIDE"]).default("RIDE_ONLY"),
  purpose: z.string().trim().min(2).max(120).optional(),
  paymentMethod: z.enum(["RAZORPAY", "UPI", "CARD", "CASH", "WALLET"]).default("RAZORPAY"),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const cancelRideSchema = z.object({ reason: z.string().trim().min(2).max(500) });
export const assignRideSchema = z.object({ driverId: z.string().uuid() });
export const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(10000).optional(), recordedAt: z.string().datetime().optional() });
export const rideEventSchema = z.object({ type: z.enum(["DRIVER_ARRIVING", "DRIVER_ARRIVED", "RIDE_STARTED", "NEAR_DESTINATION", "RIDE_COMPLETED", "INTERRUPTED"]), payload: z.record(z.string(), z.unknown()).optional() });
export const rideListQuerySchema = z.object({ status: z.enum(["REQUESTED", "SEARCHING", "ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS", "NEAR_DESTINATION", "INTERRUPTED", "COMPLETED", "CANCELLED"]).optional(), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().uuid().optional() });

export type CreateRideInput = z.infer<typeof createRideSchema>;
export type CancelRideInput = z.infer<typeof cancelRideSchema>;
export type AssignRideInput = z.infer<typeof assignRideSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type RideEventInput = z.infer<typeof rideEventSchema>;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
