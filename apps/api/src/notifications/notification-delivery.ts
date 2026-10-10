import { isGovernanceNotification } from "./notification-event.js";
import { randomUUID } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service.js";
import { rolePermissions } from "../auth/authorization.service.js";

/** Current database grants select recipients; live provider access is checked again on every read. */
export async function deliverNotification(db: PrismaService, eventId: string) {
  return db.$transaction(async (tx) => {
    const event = await tx.notificationEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.deliveredAt || event.failedAt) return;
    // Claim inside this transaction; concurrent replays serialize before fan-out.
    const claimed = await tx.notificationEvent.updateMany({
      where: { id: event.id, deliveredAt: null, failedAt: null },
      data: { attempts: { increment: 0 } },
    });
    if (!claimed.count) return;
    const repo = await tx.gitHubRepository.findFirst({
      where: {
        id: event.repositoryId,
        selected: true,
        available: true,
        installation: { active: true, organizationId: event.organizationId },
      },
    });
    if (repo) {
      const policy = isGovernanceNotification(event.type);
      const observations = await tx.contributorObservation.findMany({
        where: {
          repositoryId: repo.id,
          sourceSha: event.sourceSha ?? "",
          relationship: "PR_AUTHOR",
        },
        select: { contributor: { select: { githubUserId: true } } },
      });
      const authorIds = observations.map((o) =>
        BigInt(o.contributor.githubUserId),
      );
      const accounts = authorIds.length
        ? await tx.gitHubUserAccount.findMany({
            where: { host: "github.com", githubUserId: { in: authorIds } },
            select: { identityId: true },
          })
        : [];
      const authors = new Set(accounts.map((a) => a.identityId));
      if (event.actorId) authors.add(event.actorId);
      const members = await tx.organizationMembership.findMany({
        where: { organizationId: event.organizationId, active: true },
        include: { grants: true },
      });
      const preferences = await tx.notificationPreference.findMany({
        where: { organizationId: event.organizationId, assessments: false },
      });
      const muted = new Set(preferences.map((p) => p.identityId));
      const recipients = members.filter(
        (m) =>
          (policy || !muted.has(m.identityId)) &&
          rolePermissions[m.role]?.includes(
            policy ? "policy.read" : "assessment.read",
          ) &&
          (["OWNER", "ADMIN"].includes(m.role) ||
            m.grants.some((g) => g.repositoryId === repo.id)) &&
          (policy
            ? ["OWNER", "ADMIN", "POLICY_MANAGER"].includes(m.role)
            : ["OWNER", "ADMIN", "ENGINEERING_LEAD"].includes(m.role) ||
              (event.type === 'CRITICAL_FINDINGS_REPORTED' && m.role === 'SECURITY_ENGINEER') ||
              authors.has(m.identityId)),
      );
      await tx.inboxNotification.createMany({
        data: recipients.map((m) => ({
          id: randomUUID(),
          eventId: event.id,
          identityId: m.identityId,
        })),
        skipDuplicates: true,
      });
    }
    if (process.env.NOTIFICATION_EMAIL_ENABLED === "true") {
      const inbox = await tx.inboxNotification.findMany({
        where: { eventId: event.id },
      });
      const optedIn = await tx.notificationPreference.findMany({
        where: { organizationId: event.organizationId, email: true },
      });
      const enabled = new Set(optedIn.map((p) => p.identityId));
      await tx.notificationEmailDelivery.createMany({
        data: inbox
          .filter((n) => enabled.has(n.identityId))
          .map((n) => ({ id: randomUUID(), inboxId: n.id })),
        skipDuplicates: true,
      });
    }
    await tx.auditEvent.create({
      data: {
        event: "notification.in_app.delivered",
        actorId: null,
        metadata: {
          eventId: event.id,
          organizationId: event.organizationId,
          repositoryId: event.repositoryGithubId,
        },
      },
    });
    await tx.notificationEvent.update({
      where: { id: event.id },
      data: { deliveredAt: new Date() },
    });
  });
}
