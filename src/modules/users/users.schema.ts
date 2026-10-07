import { z } from "zod";
import { isSupportedLanguage } from "../language/language.catalog";

const genderSchema = z.enum(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]);
const dateOfBirthSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must use YYYY-MM-DD format").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return date <= new Date();
}, "Date of birth must be a valid date and cannot be in the future");

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  preferredLanguage: z.string().trim().min(2).max(10).refine(isSupportedLanguage, "Unsupported language").optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: genderSchema.optional(),
}).refine(
  (data) => data.name !== undefined || data.preferredLanguage !== undefined || data.avatarUrl !== undefined || data.dateOfBirth !== undefined || data.gender !== undefined,
  { message: "At least one field is required" },
);

export const addRoleSchema = z.object({ role: z.enum(["RIDER", "DRIVER", "GUIDE"]) });
export const updateRoleSchema = z.object({ verificationStatus: z.enum(["PENDING", "REJECTED"]) });
