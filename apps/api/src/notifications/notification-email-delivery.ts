import { isGovernanceNotification } from "./notification-event.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuthorizationService } from "../auth/authorization.service.js";
import { validNotificationEmail } from "./notification-mail.js";
export async function deliverNotificationEmail(
  db: PrismaService,
  authorization: AuthorizationService,
  mail: { send(to: string, id: string): Promise<void> },
  id: string,
) {
  const now = new Date();
  const claimed = await db.notificationEmailDelivery.updateMany({
    where: {
      id,
      state: "PENDING",
      attempts: { lt: 5 },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseUntil: new Date(now.getTime() + 60000),
      attempts: { increment: 1 },
    },
  });
  if (!claimed.count) return;
  const delivery = await db.notificationEmailDelivery.findUniqueOrThrow({
    where: { id },
    include: { inbox: { include: { event: true } } },
  });
  const event = delivery.inbox.event,
    identityId = delivery.inbox.identityId;
  let accepted = false;
  try {
    const preference = await db.notificationPreference.findUnique({
      where: {
        identityId_organizationId: {
          identityId,
          organizationId: event.organizationId,
        },
      },
    });
    const identity = await db.identity.findUnique({
      where: { id: identityId },
    });
    if (
      !preference?.email ||
      (!isGovernanceNotification(event.type) && !preference.assessments) ||
      !validNotificationEmail(identity?.email)
    ) {
      await db.notificationEmailDelivery.update({
        where: { id },
        data: {
          state: "SKIPPED",
          failureCode: "RECIPIENT_UNAVAILABLE",
          leaseUntil: null,
        },
      });
      return;
    }
    const session = {
      authenticated: true as const,
      identityId,
      organizationId: event.organizationId,
      role: "",
      subject: "",
      email: null,
    };
    await authorization.membership(identityId, event.organizationId, true);
    await authorization.requireRepository(
      session,
      event.repositoryGithubId,
      isGovernanceNotification(event.type) ? "policy.read" : "assessment.read",
    );
    // No repository names, SHAs, findings or report contents leave the application.
    await mail.send(identity.email, delivery.id);
    accepted = true;
    await db.$transaction(async (tx) => {
      await tx.notificationEmailDelivery.update({
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
          event: "notification.email.sent",
          actorId: identityId,
          metadata: { deliveryId: id, organizationId: event.organizationId },
        },
      });
    });
  } catch (error) {
    const forbidden =
      typeof (error as { getStatus?: () => number })?.getStatus ===
        "function" &&
      (error as { getStatus: () => number }).getStatus() === 403;
    await db.notificationEmailDelivery.update({
      where: { id },
      data: {
        state: forbidden
          ? "SKIPPED"
          : accepted || delivery.attempts >= 5
            ? "FAILED"
            : "PENDING",
        leaseUntil: null,
        nextAttemptAt: new Date(
          Date.now() + Math.min(60000, 1000 * 2 ** (delivery.attempts - 1)),
        ),
        failureCode: forbidden
          ? "ACCESS_REVOKED"
          : accepted
            ? "DELIVERY_UNCONFIRMED"
            : "DELIVERY_UNAVAILABLE",
      },
    });
  }
}
