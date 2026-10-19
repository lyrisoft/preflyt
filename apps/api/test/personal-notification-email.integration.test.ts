import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import { decryptVerificationCode } from "../src/notifications/notification-verification-cipher.js";
import {
  deliverVerificationEmail,
  dispatchVerificationEmails,
} from "../src/notifications/notification-verification-delivery.js";
import type { AuthorizationService } from "../src/auth/authorization.service.js";
import { disposableDatabase } from "./disposable-database.js";
import {
  personalNotificationEmail,
  requestNotificationEmail,
  verifyNotificationEmail,
  removeNotificationEmail,
} from "../src/notifications/notification-email-address.js";
let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
const key = { identityId: "person", organizationId: "workspace" };
const mail = {
  sendVerification: vi
    .fn<(email: string, id: string, code: string) => Promise<void>>()
    .mockResolvedValue(undefined),
};
beforeAll(async () => {
  fixture = await disposableDatabase("personalemail");
});
afterAll(async () => {
  await fixture?.close();
});
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await fixture.reset();
  mail.sendVerification.mockReset().mockResolvedValue(undefined);
  for (const [name, value] of Object.entries({
    NOTIFICATION_EMAIL_ENABLED: "true",
    SMTP_FROM: "preflyt@example.test",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    WEB_ORIGIN: "http://localhost:8080",
    NODE_ENV: "test",
    QUEUE_REDIS_URL: "redis://localhost:6379",
    CONFIGURATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  }))
    vi.stubEnv(name, value);
});
async function queuedCode() {
  const delivery =
    await fixture.prisma.notificationEmailVerificationDelivery.findFirstOrThrow(
      { where: { ...key, state: "PENDING" }, orderBy: { createdAt: "desc" } },
    );
  return decryptVerificationCode(delivery, delivery.encryptedCode!);
}
const authorized = {
  requireOrganization: vi.fn().mockResolvedValue({}),
} as unknown as Pick<AuthorizationService, "requireOrganization">;
it("verifies only the current user/workspace destination and keeps sign-in identities separate", async () => {
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  const code = await queuedCode();
  const pending = await fixture.prisma.notificationPreference.findUniqueOrThrow(
    { where: { identityId_organizationId: key } },
  );
  expect(pending.email).toBe(false);
  expect(pending.emailVerificationHash).not.toBe(code);
  expect(personalNotificationEmail(pending)).toBeNull();
  await expect(
    verifyNotificationEmail(
      fixture.prisma as PrismaService,
      { ...key, identityId: "another" },
      code,
    ),
  ).rejects.toThrow();
  await expect(
    verifyNotificationEmail(
      fixture.prisma as PrismaService,
      { ...key, organizationId: "another" },
      code,
    ),
  ).rejects.toThrow();
  await verifyNotificationEmail(fixture.prisma as PrismaService, key, code);
  const verified =
    await fixture.prisma.notificationPreference.findUniqueOrThrow({
      where: { identityId_organizationId: key },
    });
  expect(verified).toMatchObject({
    notificationEmail: "alerts@example.test",
    email: true,
    pendingEmail: null,
    emailVerificationHash: null,
  });
  expect(personalNotificationEmail(verified, "login@example.test")).toBe(
    "alerts@example.test",
  );
  await expect(
    verifyNotificationEmail(fixture.prisma as PrismaService, key, code),
  ).rejects.toThrow();
});
it("bounds resends and wrong-code attempts without rolling back attempt counts", async () => {
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  const code = await queuedCode();
  await expect(
    requestNotificationEmail(
      fixture.prisma as PrismaService,
      key,
      "other@example.test",
    ),
  ).rejects.toThrow("one minute");
  for (let attempt = 0; attempt < 5; attempt++)
    await expect(
      verifyNotificationEmail(fixture.prisma as PrismaService, key, "00000000"),
    ).rejects.toThrow();
  expect(
    (
      await fixture.prisma.notificationPreference.findUniqueOrThrow({
        where: { identityId_organizationId: key },
      })
    ).emailVerificationAttempts,
  ).toBe(5);
  await expect(
    verifyNotificationEmail(fixture.prisma as PrismaService, key, code),
  ).rejects.toThrow();
});
it("preserves a verified destination until replacement verification and disables alerts on removal", async () => {
  await fixture.prisma.notificationPreference.create({
    data: {
      ...key,
      notificationEmail: "old@example.test",
      emailVerifiedAt: new Date(),
      email: true,
    },
  });
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "new@example.test",
  );
  expect(
    personalNotificationEmail(
      await fixture.prisma.notificationPreference.findUnique({
        where: { identityId_organizationId: key },
      }),
    ),
  ).toBe("old@example.test");
  const code = await queuedCode();
  await removeNotificationEmail(fixture.prisma as PrismaService, key);
  const removed = await fixture.prisma.notificationPreference.findUniqueOrThrow(
    { where: { identityId_organizationId: key } },
  );
  expect(removed).toMatchObject({
    email: false,
    notificationEmail: null,
    emailVerificationHash: null,
  });
  await expect(
    verifyNotificationEmail(fixture.prisma as PrismaService, key, code),
  ).rejects.toThrow();
  expect(personalNotificationEmail(null, "account@example.test")).toBe(
    "account@example.test",
  );
});
it("rejects expired codes, malformed addresses and unavailable transport", async () => {
  await expect(
    requestNotificationEmail(
      fixture.prisma as PrismaService,
      key,
      "one@example.test\r\nBcc: other@example.test",
    ),
  ).rejects.toThrow();
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  await fixture.prisma.notificationPreference.update({
    where: { identityId_organizationId: key },
    data: { emailVerificationExpiresAt: new Date(0) },
  });
  await expect(
    verifyNotificationEmail(
      fixture.prisma as PrismaService,
      key,
      await queuedCode(),
    ),
  ).rejects.toThrow();
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "false");
  await expect(
    requestNotificationEmail(
      fixture.prisma as PrismaService,
      key,
      "new@example.test",
    ),
  ).rejects.toThrow("not configured");
});

it("acknowledges durable queueing without contacting SMTP and retries transient delivery failures", async () => {
  const result = await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  expect(result.queued).toBe(true);
  expect(mail.sendVerification).not.toHaveBeenCalled();
  const delivery =
    await fixture.prisma.notificationEmailVerificationDelivery.findFirstOrThrow(
      { where: key },
    );
  expect(delivery.encryptedCode).not.toContain(await queuedCode());
  const queue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue(undefined),
  };
  await dispatchVerificationEmails(fixture.prisma as PrismaService, queue);
  expect(queue.add).toHaveBeenCalledWith(
    "verification-email",
    { deliveryId: delivery.id, verification: true },
    expect.anything(),
  );
  mail.sendVerification.mockRejectedValueOnce(new Error("SMTP unavailable"));
  await deliverVerificationEmail(
    fixture.prisma as PrismaService,
    authorized,
    mail,
    delivery.id,
  );
  let saved =
    await fixture.prisma.notificationEmailVerificationDelivery.findUniqueOrThrow(
      { where: { id: delivery.id } },
    );
  expect(saved).toMatchObject({
    state: "PENDING",
    attempts: 1,
    leaseUntil: null,
    failureCode: "DELIVERY_UNAVAILABLE",
  });
  expect(saved.encryptedCode).not.toBeNull();
  await fixture.prisma.notificationEmailVerificationDelivery.update({
    where: { id: delivery.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await deliverVerificationEmail(
    fixture.prisma as PrismaService,
    authorized,
    mail,
    delivery.id,
  );
  saved =
    await fixture.prisma.notificationEmailVerificationDelivery.findUniqueOrThrow(
      { where: { id: delivery.id } },
    );
  expect(saved).toMatchObject({
    state: "SENT",
    attempts: 2,
    encryptedCode: null,
  });
  expect(mail.sendVerification.mock.calls[0]).toEqual(
    mail.sendVerification.mock.calls[1],
  );
  await deliverVerificationEmail(
    fixture.prisma as PrismaService,
    authorized,
    mail,
    delivery.id,
  );
  expect(mail.sendVerification).toHaveBeenCalledTimes(2);
});
it("cancels superseded deliveries and rejects ciphertext copied between users or requests", async () => {
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "old@example.test",
  );
  const old =
    await fixture.prisma.notificationEmailVerificationDelivery.findFirstOrThrow(
      { where: key },
    );
  expect(() =>
    decryptVerificationCode(
      { ...old, identityId: "someone-else" },
      old.encryptedCode!,
    ),
  ).toThrow();
  await fixture.prisma.notificationPreference.update({
    where: { identityId_organizationId: key },
    data: { emailVerificationSentAt: new Date(0) },
  });
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "new@example.test",
  );
  expect(
    await fixture.prisma.notificationEmailVerificationDelivery.findUnique({
      where: { id: old.id },
    }),
  ).toMatchObject({ state: "SKIPPED", encryptedCode: null });
  await deliverVerificationEmail(
    fixture.prisma as PrismaService,
    authorized,
    mail,
    old.id,
  );
  expect(mail.sendVerification).not.toHaveBeenCalled();
});
it("expires queued codes and clears their encrypted payload without sending", async () => {
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  await fixture.prisma.notificationEmailVerificationDelivery.updateMany({
    where: key,
    data: { expiresAt: new Date(0) },
  });
  await dispatchVerificationEmails(fixture.prisma as PrismaService, {
    getJob: vi.fn(),
    add: vi.fn(),
  });
  expect(
    await fixture.prisma.notificationEmailVerificationDelivery.findFirst({
      where: key,
    }),
  ).toMatchObject({
    state: "SKIPPED",
    encryptedCode: null,
    failureCode: "EXPIRED",
  });
  expect(mail.sendVerification).not.toHaveBeenCalled();
});
it("stops sending when permission is revoked and bounds background attempts", async () => {
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  let delivery =
    await fixture.prisma.notificationEmailVerificationDelivery.findFirstOrThrow(
      { where: key },
    );
  const denied = {
    requireOrganization: vi.fn().mockRejectedValue({ getStatus: () => 403 }),
  } as unknown as Pick<AuthorizationService, "requireOrganization">;
  await deliverVerificationEmail(
    fixture.prisma as PrismaService,
    denied,
    mail,
    delivery.id,
  );
  expect(
    await fixture.prisma.notificationEmailVerificationDelivery.findUnique({
      where: { id: delivery.id },
    }),
  ).toMatchObject({ state: "SKIPPED", encryptedCode: null });
  expect(mail.sendVerification).not.toHaveBeenCalled();
  await fixture.prisma.notificationPreference.update({
    where: { identityId_organizationId: key },
    data: { emailVerificationSentAt: new Date(0) },
  });
  await requestNotificationEmail(
    fixture.prisma as PrismaService,
    key,
    "alerts@example.test",
  );
  delivery =
    await fixture.prisma.notificationEmailVerificationDelivery.findFirstOrThrow(
      { where: { ...key, state: "PENDING" } },
    );
  await fixture.prisma.notificationEmailVerificationDelivery.update({
    where: { id: delivery.id },
    data: { attempts: 4 },
  });
  mail.sendVerification.mockRejectedValue(new Error("SMTP unavailable"));
  await deliverVerificationEmail(
    fixture.prisma as PrismaService,
    authorized,
    mail,
    delivery.id,
  );
  expect(
    await fixture.prisma.notificationEmailVerificationDelivery.findUnique({
      where: { id: delivery.id },
    }),
  ).toMatchObject({ state: "FAILED", attempts: 5, encryptedCode: null });
});
