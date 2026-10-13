import { z } from "zod";

export const adminPhoneVerificationSchema = z.object({
  method: z.enum(["SMS", "CALL", "IN_PERSON"]),
  note: z.string().trim().max(500).optional(),
});
