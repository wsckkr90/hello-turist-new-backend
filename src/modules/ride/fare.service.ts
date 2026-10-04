import { prisma } from "../../core/prisma";
import { GooglePlaceRouteAdapter } from "../place-route/place-route.adapter";
import type { VehicleType } from "./ride.schema";

export type Coordinate = { latitude: number; longitude: number };
export type FareStop = Coordinate & { name?: string; address?: string };

export type VehicleRate = {
  baseFare: number;
  perKm: number;
  minimumFare: number;
};

export type RidePricingConfig = VehicleRate & {
  currency: "INR";
  vehicleRates: Partial<Record<VehicleType, VehicleRate>>;
  updatedAt?: Date;
};

export type FareQuote = {
  currency: "INR";
  vehicleType: VehicleType;
  distanceMeters: number;
  durationSeconds: number;
  baseFare: number;
  distanceFare: number;
  totalFare: number;
  legs: Array<{ distanceMeters: number; durationSeconds: number }>;
};

const VEHICLE_TYPES: VehicleType[] = ["CAR", "SUV", "SEDAN", "HATCHBACK", "VAN", "BUS", "OTHER"];

const DEFAULT_PRICING: RidePricingConfig = {
  baseFare: 20,
  perKm: 5,
  minimumFare: 20,
  currency: "INR",
  vehicleRates: {},
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseRate(value: unknown, fallback: VehicleRate): VehicleRate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RIDE_PRICING_CONFIG_INVALID");
  const source = value as Record<string, unknown>;
  const baseFare = Number(source.baseFare ?? fallback.baseFare);
  const perKm = Number(source.perKm ?? fallback.perKm);
  const minimumFare = Number(source.minimumFare ?? fallback.minimumFare);
  if (![baseFare, perKm, minimumFare].every(Number.isFinite) || baseFare < 0 || perKm < 0 || minimumFare < 0) {
    throw new Error("RIDE_PRICING_CONFIG_INVALID");
  }
  return { baseFare, perKm, minimumFare };
}

function parsePricing(value: unknown): RidePricingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RIDE_PRICING_CONFIG_MISSING");
  const source = value as Record<string, unknown>;
  const legacy = parseRate(source, DEFAULT_PRICING);
  const rawVehicleRates = source.vehicleRates;
  const vehicleRates: Partial<Record<VehicleType, VehicleRate>> = {};
  if (rawVehicleRates !== undefined) {
    if (!rawVehicleRates || typeof rawVehicleRates !== "object" || Array.isArray(rawVehicleRates)) throw new Error("RIDE_PRICING_CONFIG_INVALID");
    const entries = rawVehicleRates as Record<string, unknown>;
    for (const type of VEHICLE_TYPES) vehicleRates[type] = parseRate(entries[type], legacy);
  }
  return { ...legacy, currency: "INR", vehicleRates };
}

export async function getRidePricing(): Promise<RidePricingConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: "RIDE_PRICING" } });
  if (!row) return DEFAULT_PRICING;
  return { ...parsePricing(row.value), updatedAt: row.updatedAt };
}

export async function updateRidePricing(input: { baseFare?: number; perKm?: number; minimumFare?: number; vehicleRates?: Partial<Record<VehicleType, Partial<VehicleRate>>> }): Promise<RidePricingConfig> {
  const current = await getRidePricing();
  const vehicleRates: Partial<Record<VehicleType, VehicleRate>> = {};
  for (const type of VEHICLE_TYPES) {
    const currentRate = current.vehicleRates[type] ?? {
      baseFare: current.baseFare,
      perKm: current.perKm,
      minimumFare: current.minimumFare,
    };
    const incoming = input.vehicleRates?.[type];
    vehicleRates[type] = incoming ? parseRate({ ...currentRate, ...incoming }, currentRate) : currentRate;
  }
  const next = parsePricing({
    baseFare: input.baseFare ?? current.baseFare,
    perKm: input.perKm ?? current.perKm,
    minimumFare: input.minimumFare ?? current.minimumFare,
    vehicleRates,
  });
  const row = await prisma.appSetting.upsert({
    where: { key: "RIDE_PRICING" },
    create: { key: "RIDE_PRICING", value: next },
    update: { value: next },
  });
  return { ...parsePricing(row.value), updatedAt: row.updatedAt };
}

export async function calculateFare(
  origin: Coordinate,
  destination: Coordinate,
  destinations: FareStop[] = [],
  vehicleType: VehicleType = "CAR",
): Promise<FareQuote> {
  const pricing = await getRidePricing();
  const rate = pricing.vehicleRates[vehicleType] ?? {
    baseFare: pricing.baseFare,
    perKm: pricing.perKm,
    minimumFare: pricing.minimumFare,
  };

  const points: FareStop[] = [origin, ...destinations, destination];
  const adapter = new GooglePlaceRouteAdapter();
  const legs: FareQuote["legs"] = [];
  let distanceMeters = 0;
  let durationSeconds = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const route = await adapter.getRoute(points[index], points[index + 1]);
    distanceMeters += route.distanceMeters;
    durationSeconds += route.durationSeconds;
    legs.push({ distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });
  }

  const distanceFare = (distanceMeters / 1000) * rate.perKm;
  const totalFare = Math.max(rate.minimumFare, rate.baseFare + distanceFare);

  return {
    currency: "INR",
    vehicleType,
    distanceMeters,
    durationSeconds,
    baseFare: money(rate.baseFare),
    distanceFare: money(distanceFare),
    totalFare: money(totalFare),
    legs,
  };
}
