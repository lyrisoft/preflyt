import { notificationQueueConfigured } from "./notification-queue.js";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import type {
  OrganizationNotificationChannel,
  Prisma,
} from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { notificationsEnabled } from "./notification-event.js";
import {
  emailNotificationsConfigured,
  emailNotificationsEnabled,
  validNotificationEmail,
} from "./notification-mail.js";

const maximumChannels = 10;
const maximumRecipients = 20;
const deliverySelect = {
  state: true,
  attempts: true,
  sentAt: true,
  createdAt: true,
  failureCode: true,
  kind: true,
} as const;

function fields(body: unknown, allowed: string[]) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new BadRequestException("Use valid email channel settings");
  return body as Record<string, unknown>;
}
function channelName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 80 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value)
  )
    throw new BadRequestException(
      "Enter a channel name with 1 to 80 characters",
    );
  return value.trim();
}
function recipients(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximumRecipients
  )
    throw new BadRequestException("Add 1 to 20 email addresses");
  const emails = value.map((raw) => {
    if (typeof raw !== "string" || raw.length > 256)
      throw new BadRequestException("Enter valid email addresses");
    const email = raw.trim().toLowerCase();
    const [local, domain] = email.split("@");
    if (
      !validNotificationEmail(email) ||
      !local ||
      local.length > 64 ||
      local.startsWith(".") ||
      local.endsWith(".") ||
      local.includes("..") ||
      !domain
        ?.split(".")
        .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
    )
      throw new BadRequestException("Enter valid email addresses");
    return email;
  });
  return [...new Set(emails)];
}
function enabled(value: unknown) {
  if (typeof value !== "boolean")
    throw new BadRequestException("Choose whether this channel is enabled");
  return value;
}
function revision(value: unknown) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 2147483646
  )
    throw new BadRequestException("Use the latest channel revision");
  return value as number;
}
function channelId(value: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(value))
    throw new NotFoundException("Email channel not found");
  return value;
}
function result(
  channel: OrganizationNotificationChannel,
  lastDelivery: unknown = null,
  pendingDeliveries = 0,
) {
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    recipients: channel.recipients,
    enabled: channel.enabled,
    revision: channel.revision,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    lastDelivery,
    pendingDeliveries,
  };
}

@Injectable()
export class NotificationChannelsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}

  private async scope(session: AuthenticatedSession) {
    return (
      await this.authorization.requireOrganization(
        session,
        "notifications.manage",
        true,
      )
    ).organizationId;
  }
  // Serializes bounded channel creation and revision changes for one organization.
  // Hold the active membership during each write so concurrent role revocation cannot slip between validation and commit.
  private async lock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    identityId: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "OrganizationMembership" WHERE "organizationId" = ${organizationId} AND "identityId" = ${identityId} AND "active" = true AND "role" IN ('OWNER', 'ADMIN') FOR SHARE`;
    if (!rows.length)
      throw new ForbiddenException(
        "Owner or Admin access is required to manage notification channels",
      );
  }
  private async current(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    expectedRevision: number,
  ) {
    const channel = await tx.organizationNotificationChannel.findFirst({
      where: { id: channelId(id), organizationId, deletedAt: null },
    });
    if (!channel) throw new NotFoundException("Email channel not found");
    if (channel.revision !== expectedRevision)
      throw new ConflictException(
        "This channel changed. Refresh and try again.",
      );
    return channel;
  }
  private async uniqueName(
    tx: Prisma.TransactionClient,
    organizationId: string,
    name: string,
    id?: string,
  ) {
    if (
      await tx.organizationNotificationChannel.findFirst({
        where: {
          organizationId,
          deletedAt: null,
          name: { equals: name, mode: "insensitive" },
          ...(id ? { id: { not: id } } : {}),
        },
      })
    )
      throw new ConflictException(
        "An email channel with this name already exists",
      );
  }
  private async audit(
    tx: Prisma.TransactionClient,
    session: AuthenticatedSession,
    action: string,
    channel: OrganizationNotificationChannel,
    extra: Prisma.InputJsonObject = {},
  ) {
    await tx.auditEvent.create({
      data: {
        event: `notification.channel.${action}`,
        actorId: session.identityId,
        metadata: {
          organizationId: channel.organizationId,
          channelId: channel.id,
          type: channel.type,
          revision: channel.revision,
          enabled: channel.enabled,
          recipientCount: channel.recipients.length,
          ...extra,
        },
      },
    });
  }

  async list(session: AuthenticatedSession) {
    const { organizationId } = await this.authorization.requireOrganization(
      session,
      "notifications.manage",
      false,
    );
    const items = await this.db.organizationNotificationChannel.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: maximumChannels,
      include: {
        _count: { select: { deliveries: { where: { state: "PENDING" } } } },
        deliveries: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: deliverySelect,
        },
      },
    });
    return {
      organizationId,
      notificationsEnabled: notificationsEnabled(),
      emailEnabled: emailNotificationsEnabled(),
      emailConfigured: emailNotificationsConfigured(),
      queueConfigured: notificationQueueConfigured(),
      canManage: true,
      items: items.map((channel) =>
        result(
          channel,
          channel.deliveries[0] ?? null,
          channel._count.deliveries,
        ),
      ),
    };
  }

  async create(session: AuthenticatedSession, input: unknown) {
    const body = fields(input, ["type", "name", "recipients", "enabled"]);
    if (body.type !== "EMAIL")
      throw new BadRequestException("Choose an email channel");
    const name = channelName(body.name),
      emails = recipients(body.recipients),
      active = body.enabled === undefined ? true : enabled(body.enabled);
    const organizationId = await this.scope(session);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, organizationId, session.identityId);
      if (
        (await tx.organizationNotificationChannel.count({
          where: { organizationId, deletedAt: null },
        })) >= maximumChannels
      )
        throw new BadRequestException(
          "Each organization can have up to 10 notification channels",
        );
      await this.uniqueName(tx, organizationId, name);
      const channel = await tx.organizationNotificationChannel.create({
        data: {
          organizationId,
          type: "EMAIL",
          name,
          recipients: emails,
          enabled: active,
          createdById: session.identityId,
          updatedById: session.identityId,
        },
      });
      await this.audit(tx, session, "created", channel);
      return result(channel);
    });
  }

  async update(session: AuthenticatedSession, id: string, input: unknown) {
    const body = fields(input, [
      "expectedRevision",
      "name",
      "recipients",
      "enabled",
    ]);
    const expectedRevision = revision(body.expectedRevision);
    if (Object.keys(body).length === 1)
      throw new BadRequestException("Choose a channel setting to update");
    const patch = {
      ...(body.name !== undefined ? { name: channelName(body.name) } : {}),
      ...(body.recipients !== undefined
        ? { recipients: recipients(body.recipients) }
        : {}),
      ...(body.enabled !== undefined ? { enabled: enabled(body.enabled) } : {}),
    };
    const organizationId = await this.scope(session);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, organizationId, session.identityId);
      const before = await this.current(
        tx,
        organizationId,
        id,
        expectedRevision,
      );
      if (patch.name) await this.uniqueName(tx, organizationId, patch.name, id);
      const channel = await tx.organizationNotificationChannel.update({
        where: { id: before.id },
        data: {
          ...patch,
          revision: { increment: 1 },
          updatedById: session.identityId,
        },
      });
      await tx.notificationChannelDelivery.updateMany({
        where: {
          channelId: channel.id,
          organizationId,
          state: "PENDING",
          ...(channel.enabled
            ? { recipient: { notIn: channel.recipients } }
            : {}),
        },
        data: {
          state: "SKIPPED",
          leaseUntil: null,
          failureCode: channel.enabled
            ? "RECIPIENT_REMOVED"
            : "CHANNEL_DISABLED",
        },
      });
      await this.audit(tx, session, "updated", channel);
      return result(channel);
    });
  }

  async remove(session: AuthenticatedSession, id: string, input: unknown) {
    const body = fields(input, ["expectedRevision"]),
      expectedRevision = revision(body.expectedRevision);
    const organizationId = await this.scope(session);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, organizationId, session.identityId);
      const before = await this.current(
        tx,
        organizationId,
        id,
        expectedRevision,
      );
      const channel = await tx.organizationNotificationChannel.update({
        where: { id: before.id },
        data: {
          deletedAt: new Date(),
          enabled: false,
          revision: { increment: 1 },
          updatedById: session.identityId,
        },
      });
      await tx.notificationChannelDelivery.updateMany({
        where: { channelId: channel.id, organizationId, state: "PENDING" },
        data: {
          state: "SKIPPED",
          leaseUntil: null,
          failureCode: "CHANNEL_REMOVED",
        },
      });
      await this.audit(tx, session, "removed", channel);
      return { removed: true };
    });
  }

  async test(session: AuthenticatedSession, id: string, input: unknown) {
    const body = fields(input, ["expectedRevision"]),
      expectedRevision = revision(body.expectedRevision);
    const organizationId = await this.scope(session);
    if (
      !notificationsEnabled() ||
      !emailNotificationsEnabled() ||
      !emailNotificationsConfigured()
    )
      throw new ServiceUnavailableException(
        "Email delivery is not configured. Ask your deployment administrator to enable notifications and configure email delivery.",
      );
    if (!notificationQueueConfigured())
      throw new ServiceUnavailableException(
        "The email delivery queue is not configured. Ask a Super Admin to configure the queue connection and start the background worker.",
      );
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, organizationId, session.identityId);
      const channel = await this.current(
        tx,
        organizationId,
        id,
        expectedRevision,
      );
      if (!channel.enabled)
        throw new BadRequestException(
          "Enable this channel before sending a test",
        );
      const recentTest = await tx.notificationChannelDelivery.findFirst({
        where: {
          channelId: channel.id,
          kind: "TEST",
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      });
      if (recentTest)
        throw new ConflictException(
          "A test was already queued. Wait a minute before sending another.",
        );
      const queued = await tx.notificationChannelDelivery.createMany({
        data: channel.recipients.map((recipient) => ({
          channelId: channel.id,
          organizationId,
          recipient,
          requestedById: session.identityId,
          kind: "TEST",
        })),
      });
      await this.audit(tx, session, "test.queued", channel, {
        queued: queued.count,
      });
      return { queued: queued.count };
    });
  }
}
