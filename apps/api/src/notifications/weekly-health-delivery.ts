import type { Queue } from "bullmq";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuthorizationService } from "../auth/authorization.service.js";
import { weeklyHealthPeriod } from "./weekly-health-schedule.js";
import {
  weeklyHealthRepository,
  type DigestRepository,
} from "./weekly-health-report.js";
import { personalNotificationEmail } from "./notification-email-address.js";
import { emailNotificationsEnabled } from "./notification-mail.js";
import { notificationsEnabled } from "./notification-event.js";

/** Database uniqueness survives Redis loss and concurrent scheduler instances. */
export async function dispatchWeeklyHealthDigests(
  db: PrismaService,
  queue: Pick<Queue, "add" | "getJob">,
  now = new Date(),
) {
  if (!emailNotificationsEnabled() || !notificationsEnabled()) return;
  let cursor: { identityId: string; organizationId: string } | undefined;
  for (;;) {
    const preferences = await db.notificationPreference.findMany({
      where: { weeklyHealthEnabled: true },
      orderBy: [{ identityId: "asc" }, { organizationId: "asc" }],
      take: 100,
      ...(cursor
        ? { cursor: { identityId_organizationId: cursor }, skip: 1 }
        : {}),
    });
    const due = preferences.flatMap((p) => {
      const period = weeklyHealthPeriod(
        now,
        p.weeklyHealthDay,
        p.weeklyHealthHour,
        p.weeklyHealthTimezone,
      );
      if (
        !p.weeklyHealthEnabledAt ||
        p.weeklyHealthEnabledAt > period.cutoff ||
        !p.weeklyHealthRepositoryIds.length
      )
        return [];
      return [
        {
          identityId: p.identityId,
          organizationId: p.organizationId,
          ...period,
          repositoryIds: p.weeklyHealthRepositoryIds,
        },
      ];
    });
    if (due.length)
      await db.weeklyHealthDigestDelivery.createMany({
        data: due,
        skipDuplicates: true,
      });
    if (preferences.length < 100) break;
    const last = preferences.at(-1)!;
    cursor = {
      identityId: last.identityId,
      organizationId: last.organizationId,
    };
  }
  await db.weeklyHealthDigestDelivery.updateMany({
    where: {
      state: "PENDING",
      attempts: { gte: 5 },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      state: "FAILED",
      failureCode: "DELIVERY_UNCONFIRMED",
      leaseUntil: null,
    },
  });
  const pending = await db.weeklyHealthDigestDelivery.findMany({
    where: {
      state: "PENDING",
      attempts: { lt: 5 },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const delivery of pending) {
    const jobId = `weekly-${delivery.id}`,
      previous = await queue.getJob(jobId);
    if (previous && ["completed", "failed"].includes(await previous.getState()))
      await previous.remove();
    await queue.add(
      "weekly-health",
      { deliveryId: delivery.id, weeklyHealth: true },
      { jobId, attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    );
  }
}
const forbidden = (error: unknown) =>
  typeof (error as { getStatus?: unknown })?.getStatus === "function" &&
  (error as { getStatus(): number }).getStatus() === 403;
export async function deliverWeeklyHealthDigest(
  db: PrismaService,
  authorization: AuthorizationService,
  mail: {
    sendWeeklyHealth(
      to: string,
      id: string,
      week: string,
      repositories: DigestRepository[],
    ): Promise<void>;
  },
  id: string,
) {
  if (!emailNotificationsEnabled() || !notificationsEnabled()) return;
  const now = new Date();
  const claim = await db.weeklyHealthDigestDelivery.updateMany({
    where: {
      id,
      state: "PENDING",
      attempts: { lt: 5 },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      attempts: { increment: 1 },
      leaseUntil: new Date(now.getTime() + 300000),
    },
  });
  if (!claim.count) return;
  const delivery = await db.weeklyHealthDigestDelivery.findUniqueOrThrow({
    where: { id },
  });
  const key = {
    identityId: delivery.identityId,
    organizationId: delivery.organizationId,
  };
  const session = {
    authenticated: true as const,
    ...key,
    role: "",
    subject: "",
    email: null,
  };
  const skip = (failureCode: string) =>
    db.weeklyHealthDigestDelivery.update({
      where: { id },
      data: { state: "SKIPPED", failureCode, leaseUntil: null },
    });
  let accepted = false;
  try {
    const preference = await db.notificationPreference.findUnique({
      where: { identityId_organizationId: key },
    });
    const identity = await db.identity.findUnique({
      where: { id: key.identityId },
    });
    const email = personalNotificationEmail(preference, identity?.email);
    if (
      !preference?.weeklyHealthEnabled ||
      !email ||
      !preference.weeklyHealthEnabledAt ||
      preference.weeklyHealthEnabledAt > delivery.cutoff
    ) {
      await skip("RECIPIENT_UNAVAILABLE");
      return;
    }
    if (now.getTime() - delivery.cutoff.getTime() >= 7 * 86400000) {
      await skip("DIGEST_EXPIRED");
      return;
    }
    await authorization.requireOrganization(session, "assessment.read", true);
    const summaries: DigestRepository[] = [];
    for (const githubId of delivery.repositoryIds.filter((repo) =>
      preference.weeklyHealthRepositoryIds.includes(repo),
    )) {
      try {
        const repository = await authorization.requireRepository(
          session,
          githubId,
          "assessment.read",
          true,
          false,
        );
        summaries.push(
          await weeklyHealthRepository(
            db,
            key.organizationId,
            repository,
            delivery.periodStart,
            delivery.cutoff,
          ),
        );
      } catch (error) {
        if (!forbidden(error)) throw error;
      }
    }
    // Building a report may take time. Refresh membership, repository access and
    // preferences immediately before handing any repository data to SMTP.
    await authorization.requireOrganization(session, "assessment.read", true);
    const authorized: DigestRepository[] = [];
    for (const summary of summaries) {
      try {
        await authorization.requireRepository(
          session,
          summary.githubId,
          "assessment.read",
          true,
          false,
        );
        authorized.push(summary);
      } catch (error) {
        if (!forbidden(error)) throw error;
      }
    }
    const current = await db.notificationPreference.findUnique({
      where: { identityId_organizationId: key },
    });
    const currentIdentity = await db.identity.findUnique({
      where: { id: key.identityId },
    });
    if (
      !current?.weeklyHealthEnabled ||
      current.updatedAt.getTime() !== preference.updatedAt.getTime() ||
      personalNotificationEmail(current, currentIdentity?.email) !== email
    ) {
      await skip("RECIPIENT_CHANGED");
      return;
    }
    if (!authorized.length) {
      await skip("ACCESS_REVOKED");
      return;
    }
    if (!emailNotificationsEnabled() || !notificationsEnabled()) {
      await skip("DELIVERY_DISABLED");
      return;
    }
    // Fence a lost/expired lease; another worker must never send this claim.
    const renewed = await db.weeklyHealthDigestDelivery.updateMany({
      where: {
        id,
        state: "PENDING",
        attempts: delivery.attempts,
        leaseUntil: { gt: new Date() },
      },
      data: { leaseUntil: new Date(Date.now() + 60000) },
    });
    if (!renewed.count) return;
    await mail.sendWeeklyHealth(email, id, delivery.week, authorized);
    accepted = true;
    await db.$transaction(async (tx) => {
      await tx.weeklyHealthDigestDelivery.update({
        where: { id },
        data: {
          state: "SENT",
          sentAt: new Date(),
          leaseUntil: null,
          failureCode: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          event: "notification.weekly_health.sent",
          actorId: key.identityId,
          metadata: {
            organizationId: key.organizationId,
            deliveryId: id,
            week: delivery.week,
            repositoryCount: authorized.length,
          },
        },
      });
    });
  } catch (error) {
    await db.weeklyHealthDigestDelivery.updateMany({
      where: { id, state: "PENDING", attempts: delivery.attempts },
      data: {
        state: forbidden(error)
          ? "SKIPPED"
          : accepted || delivery.attempts >= 5
            ? "FAILED"
            : "PENDING",
        leaseUntil: null,
        nextAttemptAt: new Date(
          Date.now() + Math.min(60000, 1000 * 2 ** (delivery.attempts - 1)),
        ),
        failureCode: forbidden(error)
          ? "ACCESS_REVOKED"
          : accepted
            ? "DELIVERY_UNCONFIRMED"
            : "DELIVERY_UNAVAILABLE",
      },
    });
  }
}
