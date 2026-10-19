import type { Queue } from "bullmq";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuthorizationService } from "../auth/authorization.service.js";
import type { NotificationMailer } from "./notification-mail.js";
import { emailNotificationsEnabled } from "./notification-mail.js";
import { decryptVerificationCode } from "./notification-verification-cipher.js";

/** Reconciliation recovers pending deliveries after Redis or worker restarts. */
export async function dispatchVerificationEmails(
  db: PrismaService,
  queue: Pick<Queue, "add" | "getJob">,
) {
  const now = new Date();
  await db.notificationEmailVerificationDelivery.updateMany({
    where: { state: "PENDING", expiresAt: { lte: now } },
    data: {
      state: "SKIPPED",
      encryptedCode: null,
      leaseUntil: null,
      failureCode: "EXPIRED",
    },
  });
  await db.notificationEmailVerificationDelivery.updateMany({
    where: {
      state: "PENDING",
      attempts: { gte: 5 },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      state: "FAILED",
      encryptedCode: null,
      leaseUntil: null,
      failureCode: "DELIVERY_UNCONFIRMED",
    },
  });
  await db.notificationEmailVerificationDelivery.deleteMany({
    where: {
      state: { not: "PENDING" },
      createdAt: { lt: new Date(now.getTime() - 30 * 86400000) },
    },
  });
  const pending = await db.notificationEmailVerificationDelivery.findMany({
    where: {
      state: "PENDING",
      attempts: { lt: 5 },
      expiresAt: { gt: now },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (const delivery of pending) {
    const jobId = `verification-${delivery.id}`;
    const previous = await queue.getJob(jobId);
    if (previous && ["completed", "failed"].includes(await previous.getState()))
      await previous.remove();
    await queue.add(
      "verification-email",
      { deliveryId: delivery.id, verification: true },
      { jobId, attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    );
  }
}

export async function deliverVerificationEmail(
  db: PrismaService,
  authorization: Pick<AuthorizationService, "requireOrganization">,
  mail: Pick<NotificationMailer, "sendVerification">,
  id: string,
) {
  if (!emailNotificationsEnabled()) return;
  const now = new Date(),
    leaseUntil = new Date(now.getTime() + 60000);
  const claimed = await db.notificationEmailVerificationDelivery.updateMany({
    where: {
      id,
      state: "PENDING",
      attempts: { lt: 5 },
      expiresAt: { gt: now },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil, attempts: { increment: 1 } },
  });
  if (!claimed.count) return;
  const delivery = await db.notificationEmailVerificationDelivery.findFirst({
    where: { id, state: "PENDING", leaseUntil },
  });
  if (!delivery) return;
  const owned = {
    id,
    state: "PENDING",
    leaseUntil,
    attempts: delivery.attempts,
  };
  let accepted = false;
  try {
    await authorization.requireOrganization(
      {
        authenticated: true,
        identityId: delivery.identityId,
        organizationId: delivery.organizationId,
        role: "",
        subject: "",
        email: null,
      },
      "assessment.read",
      true,
    );
    const key = {
      identityId: delivery.identityId,
      organizationId: delivery.organizationId,
    };
    const current = await db.notificationPreference.findUnique({
      where: { identityId_organizationId: key },
    });
    if (
      !current?.pendingEmail ||
      current.emailVerificationHash !== delivery.tokenHash ||
      !current.emailVerificationExpiresAt ||
      current.emailVerificationExpiresAt <= new Date() ||
      current.emailVerificationAttempts >= 5 ||
      !delivery.encryptedCode
    ) {
      await db.notificationEmailVerificationDelivery.updateMany({
        where: owned,
        data: {
          state: "SKIPPED",
          encryptedCode: null,
          leaseUntil: null,
          failureCode: "VERIFICATION_UNAVAILABLE",
        },
      });
      return;
    }
    const code = decryptVerificationCode(delivery, delivery.encryptedCode);
    // A resend, removal or verification may have cancelled this lease during authorization.
    if (
      !(await db.notificationEmailVerificationDelivery.findFirst({
        where: owned,
        select: { id: true },
      }))
    )
      return;
    if (!emailNotificationsEnabled()) {
      await db.notificationEmailVerificationDelivery.updateMany({
        where: owned,
        data: { leaseUntil: null, attempts: { decrement: 1 } },
      });
      return;
    }
    await mail.sendVerification(current.pendingEmail, delivery.id, code);
    accepted = true;
    await db.notificationEmailVerificationDelivery.updateMany({
      where: owned,
      data: {
        state: "SENT",
        encryptedCode: null,
        sentAt: new Date(),
        leaseUntil: null,
        failureCode: null,
      },
    });
  } catch (error) {
    const forbidden =
      (error as { getStatus?: () => number })?.getStatus?.() === 403;
    const terminal =
      forbidden ||
      accepted ||
      delivery.attempts >= 5 ||
      delivery.expiresAt <= new Date();
    await db.notificationEmailVerificationDelivery.updateMany({
      where: owned,
      data: {
        state: forbidden ? "SKIPPED" : terminal ? "FAILED" : "PENDING",
        ...(terminal ? { encryptedCode: null } : {}),
        leaseUntil: null,
        nextAttemptAt: new Date(
          Date.now() + Math.min(60000, 5000 * 2 ** (delivery.attempts - 1)),
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
