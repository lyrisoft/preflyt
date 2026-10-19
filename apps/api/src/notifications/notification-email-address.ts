import {
  createHash,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { encryptVerificationCode } from "./notification-verification-cipher.js";
import { notificationQueueConfigured } from "./notification-queue.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  emailNotificationsConfigured,
  emailNotificationsEnabled,
  validNotificationEmail,
} from "./notification-mail.js";

type Key = { identityId: string; organizationId: string };
const digest = (key: Key, email: string, code: string) =>
  createHash("sha256")
    .update(JSON.stringify([key.identityId, key.organizationId, email, code]))
    .digest("hex");
export function personalNotificationEmail(
  preference: {
    notificationEmail?: string | null;
    emailVerifiedAt?: Date | null;
  } | null,
  accountEmail?: string | null,
) {
  return preference?.emailVerifiedAt &&
    validNotificationEmail(preference.notificationEmail)
    ? preference.notificationEmail
    : validNotificationEmail(accountEmail)
      ? accountEmail
      : null;
}

/** Notification destination only. Never updates identity or sign-in account links. */
export async function requestNotificationEmail(
  db: PrismaService,
  key: Key,
  value: unknown,
) {
  const email = typeof value === "string" ? value.trim() : "";
  if (!validNotificationEmail(email))
    throw new BadRequestException("Enter a valid email address.");
  if (
    !emailNotificationsEnabled() ||
    !emailNotificationsConfigured() ||
    !notificationQueueConfigured()
  )
    throw new ServiceUnavailableException(
      "Email delivery is not configured. Ask your deployment administrator to enable it.",
    );
  const code = String(randomInt(10000000, 100000000)),
    tokenHash = digest(key, email, code),
    now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60000);
  const delivery = { id: randomUUID(), ...key, tokenHash };
  const encryptedCode = encryptVerificationCode(delivery, code);
  await db.$transaction(async (tx) => {
    await tx.notificationPreference.upsert({
      where: { identityId_organizationId: key },
      create: key,
      update: {},
    });
    await tx.$queryRaw`SELECT "identityId" FROM "NotificationPreference" WHERE "identityId" = ${key.identityId} AND "organizationId" = ${key.organizationId} FOR UPDATE`;
    const current = await tx.notificationPreference.findUniqueOrThrow({
      where: { identityId_organizationId: key },
    });
    if (
      current.emailVerificationSentAt &&
      now.getTime() - current.emailVerificationSentAt.getTime() < 60000
    )
      throw new HttpException(
        "Wait one minute before requesting another code.",
        429,
      );
    const sameWindow =
      current.emailVerificationWindowAt &&
      now.getTime() - current.emailVerificationWindowAt.getTime() < 3600000;
    if (sameWindow && current.emailVerificationSendCount >= 3)
      throw new HttpException(
        "Too many verification requests. Try again in an hour.",
        429,
      );
    await tx.notificationPreference.update({
      where: { identityId_organizationId: key },
      data: {
        pendingEmail: email,
        emailVerificationHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
        emailVerificationAttempts: 0,
        emailVerificationSentAt: now,
        emailVerificationWindowAt: sameWindow
          ? current.emailVerificationWindowAt
          : now,
        emailVerificationSendCount: sameWindow
          ? current.emailVerificationSendCount + 1
          : 1,
      },
    });
    await tx.notificationEmailVerificationDelivery.updateMany({
      where: { ...key, state: "PENDING" },
      data: {
        state: "SKIPPED",
        encryptedCode: null,
        leaseUntil: null,
        failureCode: "SUPERSEDED",
      },
    });
    await tx.notificationEmailVerificationDelivery.create({
      data: { ...delivery, encryptedCode, expiresAt },
    });
    await tx.auditEvent.create({
      data: {
        event: "notification.email.verification_requested",
        actorId: key.identityId,
        metadata: { organizationId: key.organizationId },
      },
    });
  });
  return {
    queued: true,
    pendingEmail: email,
    verificationExpiresAt: expiresAt,
    verificationRequestedAt: now,
  };
}

export async function verifyNotificationEmail(
  db: PrismaService,
  key: Key,
  value: unknown,
) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value.trim()))
    throw new BadRequestException("Enter the eight-digit verification code.");
  const code = value.trim();
  const valid = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "identityId" FROM "NotificationPreference" WHERE "identityId" = ${key.identityId} AND "organizationId" = ${key.organizationId} FOR UPDATE`;
    const current = await tx.notificationPreference.findUnique({
      where: { identityId_organizationId: key },
    });
    if (
      !current?.pendingEmail ||
      !current.emailVerificationHash ||
      !current.emailVerificationExpiresAt ||
      current.emailVerificationExpiresAt <= new Date() ||
      current.emailVerificationAttempts >= 5
    )
      return false;
    const expected = Buffer.from(current.emailVerificationHash, "hex"),
      actual = Buffer.from(digest(key, current.pendingEmail, code), "hex");
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      await tx.notificationPreference.update({
        where: { identityId_organizationId: key },
        data: {
          emailVerificationAttempts: { increment: 1 },
          ...(current.emailVerificationAttempts >= 4
            ? { emailVerificationHash: null }
            : {}),
        },
      });
      return false;
    }
    await tx.notificationPreference.update({
      where: { identityId_organizationId: key },
      data: {
        notificationEmail: current.pendingEmail,
        emailVerifiedAt: new Date(),
        email: true,
        pendingEmail: null,
        emailVerificationHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });
    await tx.notificationEmailVerificationDelivery.updateMany({
      where: { ...key, state: "PENDING" },
      data: {
        state: "SKIPPED",
        encryptedCode: null,
        leaseUntil: null,
        failureCode: "VERIFIED",
      },
    });
    await tx.auditEvent.create({
      data: {
        event: "notification.email.verified",
        actorId: key.identityId,
        metadata: { organizationId: key.organizationId },
      },
    });
    return true;
  });
  if (!valid)
    throw new BadRequestException(
      "The code is incorrect or expired. Request a new code if needed.",
    );
  return { verified: true };
}

export async function removeNotificationEmail(db: PrismaService, key: Key) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "identityId" FROM "NotificationPreference" WHERE "identityId" = ${key.identityId} AND "organizationId" = ${key.organizationId} FOR UPDATE`;
    await tx.notificationEmailVerificationDelivery.updateMany({
      where: { ...key, state: "PENDING" },
      data: {
        state: "SKIPPED",
        encryptedCode: null,
        leaseUntil: null,
        failureCode: "REMOVED",
      },
    });
    await tx.notificationPreference.updateMany({
      where: key,
      data: {
        email: false,
        notificationEmail: null,
        emailVerifiedAt: null,
        pendingEmail: null,
        emailVerificationHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });
    await tx.auditEvent.create({
      data: {
        event: "notification.email.removed",
        actorId: key.identityId,
        metadata: { organizationId: key.organizationId },
      },
    });
  });
  return { removed: true };
}
