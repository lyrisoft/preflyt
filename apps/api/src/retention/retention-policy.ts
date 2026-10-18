import { BadRequestException } from "@nestjs/common";
export const retentionFields = [
  "assessmentDays",
  "sourceDays",
  "notificationDays",
  "activityDays",
  "auditDays",
] as const;
export type RetentionField = (typeof retentionFields)[number];
export const retentionDefaults = {
  assessmentDays: 90,
  sourceDays: 90,
  notificationDays: 90,
  activityDays: 90,
  auditDays: 365,
};
export function retentionInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("Choose valid retention settings.");
  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["revision", "enabled", ...retentionFields].includes(key),
    ) ||
    typeof body.enabled !== "boolean" ||
    !Number.isSafeInteger(body.revision) ||
    Number(body.revision) < 1
  )
    throw new BadRequestException("Refresh retention settings and try again.");
  for (const field of retentionFields)
    if (
      !Number.isSafeInteger(body[field]) ||
      Number(body[field]) < (field === "auditDays" ? 90 : 30) ||
      Number(body[field]) > 3650
    )
      throw new BadRequestException(
        `${field === "auditDays" ? "Audit history requires 90" : "Retention requires 30"}–3650 whole days.`,
      );
  return body as { revision: number; enabled: boolean } & Record<
    RetentionField,
    number
  >;
}
