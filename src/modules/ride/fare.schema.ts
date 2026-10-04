import { z } from "zod";
import { routeStopSchema, vehicleTypeSchema } from "./ride.schema";

const coordinate = z.number().min(-180).max(180);

export const fareQuoteSchema = z.object({
  pickupLatitude: coordinate.refine((v) => v >= -90 && v <= 90, "Invalid latitude"),
  pickupLongitude: coordinate,
  dropoffLatitude: coordinate.refine((v) => v >= -90 && v <= 90, "Invalid latitude"),
  dropoffLongitude: coordinate,
  destinations: z.array(routeStopSchema).max(8).default([]),
  vehicleType: vehicleTypeSchema.default("CAR"),
});

export type FareQuoteInput = z.infer<typeof fareQuoteSchema>;
