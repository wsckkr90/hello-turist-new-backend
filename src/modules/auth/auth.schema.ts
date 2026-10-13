
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),

  username: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-]+$/),

  email: z.string().email().optional(),

  password: z.string().min(8).max(128),
  termsAccepted: z.literal(true),
  termsVersion: z.string().trim().min(1).max(40).default("2026-10-13"),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(255),

  password: z.string().min(8).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});