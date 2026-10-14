import { z } from "zod";
import { prisma } from "../../core/prisma";

const SETTING_KEY = "RIDE_SAFETY_RECORDING_POLICY";

const recordingPolicySchema = z.object({
  enabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(365),
  // Consent and explicit provider acknowledgement are mandatory safety invariants.
  riderConsentRequired: z.literal(true),
  providerAcknowledgementRequired: z.literal(true),
}).strict();

export type RideSafetyRecordingPolicy = z.infer<typeof recordingPolicySchema>;

function defaultPolicy(): RideSafetyRecordingPolicy {
  const configuredRetention = Number(process.env.RIDE_RECORDING_RETENTION_DAYS || 30);
  const retentionDays = Number.isInteger(configuredRetention) && configuredRetention >= 1 && configuredRetention <= 365
    ? configuredRetention
    : 30;
  return {
    enabled: false,
    retentionDays,
    riderConsentRequired: true,
    providerAcknowledgementRequired: true,
  };
}

function parseStoredPolicy(value: unknown): RideSafetyRecordingPolicy {
  const parsed = recordingPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : defaultPolicy();
}

export async function getRideSafetyRecordingPolicy(): Promise<RideSafetyRecordingPolicy> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  return setting ? parseStoredPolicy(setting.value) : defaultPolicy();
}

export async function updateRideSafetyRecordingPolicy(input: unknown): Promise<RideSafetyRecordingPolicy> {
  const parsed = recordingPolicySchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_RECORDING_POLICY");

  const saved = await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: parsed.data },
    update: { value: parsed.data },
  });
  return parseStoredPolicy(saved.value);
}
