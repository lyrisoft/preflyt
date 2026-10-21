import { BadRequestException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { personalNotificationEmail } from "./notification-email-address.js";
import {
  emailNotificationsEnabled,
  emailNotificationsConfigured,
} from "./notification-mail.js";
import { notificationsEnabled } from "./notification-event.js";
import { notificationQueueConfigured } from "./notification-queue.js";

export async function weeklyHealthPreferences(
  db: PrismaService,
  authorization: AuthorizationService,
  session: AuthenticatedSession,
) {
  await authorization.requireOrganization(session, "assessment.read", true);
  const [preference, repositories, identity, membership] = await Promise.all([
    db.notificationPreference.findUnique({
      where: {
        identityId_organizationId: {
          identityId: session.identityId,
          organizationId: session.organizationId!,
        },
      },
    }),
    authorization.repositoryScope(
      session.identityId,
      session.organizationId,
      "assessment.read",
    ),
    db.identity.findUnique({
      where: { id: session.identityId },
      select: { email: true },
    }),
    db.organizationMembership.findFirst({
      where: {
        identityId: session.identityId,
        organizationId: session.organizationId!,
        active: true,
      },
      include: { grants: true },
    }),
  ]);
  const allowed = new Set(repositories.map((r) => String(r.githubId)));
  return {
    enabled: preference?.weeklyHealthEnabled ?? false,
    repositoryIds: (preference?.weeklyHealthRepositoryIds ?? []).filter((id) =>
      allowed.has(id),
    ),
    suggestedRepositoryIds: repositories
      .filter((r) => membership?.grants.some((g) => g.repositoryId === r.id))
      .map((r) => String(r.githubId)),
    day: preference?.weeklyHealthDay ?? 1,
    hour: preference?.weeklyHealthHour ?? 9,
    timezone: preference?.weeklyHealthTimezone ?? "UTC",
    emailAddress: personalNotificationEmail(preference, identity?.email),
    deliveryAvailable:
      notificationsEnabled() &&
      emailNotificationsEnabled() &&
      emailNotificationsConfigured() &&
      notificationQueueConfigured(),
    repositories: repositories
      .map((r) => ({ id: String(r.githubId), name: r.fullName }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export type WeeklyHealthInput = {
  enabled?: unknown;
  repositoryIds?: unknown;
  day?: unknown;
  hour?: unknown;
  timezone?: unknown;
};
export async function saveWeeklyHealthPreferences(
  db: PrismaService,
  authorization: AuthorizationService,
  session: AuthenticatedSession,
  input: WeeklyHealthInput,
) {
  await authorization.requireOrganization(session, "assessment.read", true);
  const { enabled, repositoryIds, day, hour, timezone } = input;
  if (
    typeof enabled !== "boolean" ||
    !Array.isArray(repositoryIds) ||
    repositoryIds.length > 50 ||
    repositoryIds.some(
      (id) => typeof id !== "string" || !/^[1-9]\d{0,15}$/.test(id),
    ) ||
    new Set(repositoryIds).size !== repositoryIds.length ||
    (enabled && !repositoryIds.length)
  )
    throw new BadRequestException(
      "Choose up to 50 repositories for your weekly email.",
    );
  if (
    !Number.isInteger(day) ||
    Number(day) < 0 ||
    Number(day) > 6 ||
    !Number.isInteger(hour) ||
    Number(hour) < 0 ||
    Number(hour) > 23 ||
    typeof timezone !== "string" ||
    timezone.length > 100
  )
    throw new BadRequestException("Choose a valid day, hour and timezone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException(
      "Choose a valid timezone, such as Africa/Lagos.",
    );
  }
  // The organization check refreshes GitHub access once for this batch.
  // Each repository still rechecks local grants and uses that fresh evidence.
  for (const id of repositoryIds)
    await authorization.requireRepository(
      session,
      id,
      "assessment.read",
      true,
      false,
    );
  const key = {
    identityId: session.identityId,
    organizationId: session.organizationId!,
  };
  await db.$transaction(async (tx) => {
    await tx.notificationPreference.upsert({
      where: { identityId_organizationId: key },
      create: key,
      update: {},
    });
    await tx.$queryRaw`SELECT "identityId" FROM "NotificationPreference" WHERE "identityId"=${key.identityId} AND "organizationId"=${key.organizationId} FOR UPDATE`;
    const preference = await tx.notificationPreference.findUniqueOrThrow({
      where: { identityId_organizationId: key },
    });
    const identity = await tx.identity.findUnique({
      where: { id: key.identityId },
      select: { email: true },
    });
    if (enabled && !personalNotificationEmail(preference, identity?.email))
      throw new BadRequestException(
        "Add and verify a delivery email before enabling the weekly email.",
      );
    if (
      enabled &&
      (!notificationsEnabled() ||
        !emailNotificationsEnabled() ||
        !emailNotificationsConfigured() ||
        !notificationQueueConfigured())
    )
      throw new BadRequestException(
        "Email delivery is unavailable. Ask your deployment administrator to configure it.",
      );
    await tx.notificationPreference.update({
      where: { identityId_organizationId: key },
      data: {
        weeklyHealthEnabled: enabled,
        weeklyHealthRepositoryIds: repositoryIds,
        weeklyHealthDay: Number(day),
        weeklyHealthHour: Number(hour),
        weeklyHealthTimezone: timezone,
        weeklyHealthEnabledAt: enabled
          ? preference.weeklyHealthEnabled
            ? preference.weeklyHealthEnabledAt
            : new Date()
          : null,
      },
    });
    await tx.auditEvent.create({
      data: {
        event: "notification.weekly_health.preferences.updated",
        actorId: key.identityId,
        metadata: {
          organizationId: key.organizationId,
          enabled,
          repositoryIds,
          day: Number(day),
          hour: Number(hour),
          timezone,
        },
      },
    });
  });
  return weeklyHealthPreferences(db, authorization, session);
}
