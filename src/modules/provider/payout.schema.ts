import { z } from "zod";

export const payoutAccountSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("BANK"),
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().regex(/^\d{9,18}$/),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  }),
  z.object({
    method: z.literal("UPI"),
    upiVpa: z.string().trim().toLowerCase().regex(/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/),
  }),
]);

export type PayoutAccountInput = z.infer<typeof payoutAccountSchema>;
