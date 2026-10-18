import { notificationContent } from "./notification-content.js";
import { aiNotificationTypes } from "./ai-notification.js";
import { configurationValue } from "../configuration/runtime-configuration.js";
import { validNotificationEmail } from "./notification-mail.js";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  notificationsEnabled,
  governanceNotificationTypes,
  assessmentNotificationTypes,
} from "./notification-event.js";

export type InboxFilters = {
  unread?: string;
  severity?: string;
  repository?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: string;
};
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  private async scope(
    session: AuthenticatedSession,
  ): Promise<Prisma.InboxNotificationWhereInput> {
    const [assessments, policies, member] = await Promise.all([
      this.authorization.repositoryScope(
        session.identityId,
        session.organizationId,
        "assessment.read",
      ),
      this.authorization.repositoryScope(
        session.identityId,
        session.organizationId,
        "policy.read",
      ),
      this.authorization.membership(session.identityId, session.organizationId),
    ]);
    return {
      identityId: session.identityId,
      event: {
        organizationId: session.organizationId ?? "",
        OR: [
          ...(["OWNER", "ADMIN"].includes(member?.role ?? "")
            ? [
                {
                  type: { in: aiNotificationTypes },
                  repositoryId: { in: assessments.map((r) => r.id) },
                },
              ]
            : []),
          {
            type: { in: assessmentNotificationTypes },
            repositoryId: { in: assessments.map((r) => r.id) },
          },
          {
            type: { in: governanceNotificationTypes },
            repositoryId: { in: policies.map((r) => r.id) },
          },
        ],
      },
    };
  }
  async summary(session: AuthenticatedSession) {
    if (!notificationsEnabled()) return {enabled:false,unreadCount:0}
    const scope=await this.scope(session)
    return {enabled:true,unreadCount:await this.db.inboxNotification.count({where:{AND:[scope,{readAt:null}]}})}
  }
  async preview(session: AuthenticatedSession) { return this.list(session,{unread:'true'},true) }
  async list(session: AuthenticatedSession, filters: InboxFilters, preview = false) {
    if (!notificationsEnabled())
      return {
        enabled: false,
        items: [],
        unreadCount: 0,
        total: 0,
        page: 1,
        repositories: [],
      };
    if (Object.values(filters).some((v) => typeof v !== "string"))
      throw new BadRequestException("Choose valid notification filters");
    const page = Number(filters.page ?? 1);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10000 ||
      (filters.unread !== undefined &&
        !["true", "false"].includes(filters.unread)) ||
      (filters.severity &&
        !["info", "warning", "error"].includes(filters.severity)) ||
      (filters.type &&
        ![
          ...assessmentNotificationTypes,
          ...governanceNotificationTypes,
          ...aiNotificationTypes,
        ].includes(filters.type)) ||
      (filters.repository && !/^[1-9]\d{0,15}$/.test(filters.repository))
    )
      throw new BadRequestException("Choose valid notification filters");
    const date = (value?: string) => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      )
        throw new BadRequestException("Use a valid date");
      return parsed;
    };
    const from = date(filters.from),
      to = date(filters.to);
    if (from && to && from > to)
      throw new BadRequestException("Start date must be before end date");
    const scope = await this.scope(session);
    const where: Prisma.InboxNotificationWhereInput = {
      AND: [
        scope,
        {
          ...(filters.unread === "true" ? { readAt: null } : {}),
          event: {
            ...(filters.severity ? { severity: filters.severity } : {}),
            ...(filters.type ? { type: filters.type } : {}),
            ...(filters.repository
              ? { repositoryGithubId: filters.repository }
              : {}),
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}),
            },
          },
        },
      ],
    };
    const [items, total, unreadCount, repositories] = await Promise.all([
      this.db.inboxNotification.findMany({
        where,
        include: {
          event: true,
          emailDelivery: {
            select: {
              state: true,
              attempts: true,
              sentAt: true,
              nextAttemptAt: true,
              failureCode: true,
            },
          },
        },
        orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
        take: preview ? 5 : 25,
        skip: (page - 1) * 25,
      }),
      preview ? Promise.resolve(0) : this.db.inboxNotification.count({ where }),
      this.db.inboxNotification.count({
        where: { AND: [scope, { readAt: null }] },
      }),
      preview ? Promise.resolve([]) : this.db.notificationEvent.groupBy({
        by: ['repositoryGithubId'], where: {notifications:{some:scope}},
        _max: {repositoryName:true}, orderBy: {repositoryGithubId:'asc'},
      }).then(rows=>rows.map(row=>({repositoryGithubId:row.repositoryGithubId,repositoryName:row._max.repositoryName ?? ''}))),
    ]);
    // Fetch context only for events already admitted by the current inbox scope.
    const assessmentIds = items.flatMap((row) =>
      row.event.assessmentId ? [row.event.assessmentId] : [],
    );
    const policyIds = items.flatMap((row) =>
      row.event.policyId ? [row.event.policyId] : [],
    );
    const [assessments, policies] = await Promise.all([
      assessmentIds.length
        ? this.db.commitAssessment.findMany({
            where: {
              id: { in: assessmentIds },
              repositoryId: { in: items.map((row) => row.event.repositoryId) },
              repository: {
                installation: { organizationId: session.organizationId ?? "" },
              },
            },
            select: {
              id: true,
              repositoryId: true,
              sourceSha: true,
              report: true,
            },
          })
        : [],
      policyIds.length
        ? this.db.gatePolicyRevision.findMany({
            where: {
              id: { in: policyIds },
              organizationId: session.organizationId ?? "",
              repositoryId: { in: items.map((row) => row.event.repositoryId) },
            },
            select: {
              id: true,
              repositoryId: true,
              branchRef: true,
              revision: true,
            },
          })
        : [],
    ]);
    const reports = new Map(assessments.map((row) => [row.id, row]));
    const revisions = new Map(policies.map((row) => [row.id, row]));
    return {
      enabled: true,
      total: preview ? unreadCount : total,
      unreadCount,
      page,
      repositories,
      items: items.map((row) => {
        const assessment = row.event.assessmentId
          ? reports.get(row.event.assessmentId)
          : undefined;
        const policy = row.event.policyId
          ? revisions.get(row.event.policyId)
          : undefined;
        return {
          ...notificationContent(
            row.event.type,
            assessment?.repositoryId === row.event.repositoryId &&
              assessment.sourceSha === row.event.sourceSha
              ? assessment.report
              : undefined,
            policy?.repositoryId === row.event.repositoryId
              ? policy
              : undefined,
          ),
          ...(row.event.branchRef ? { details: ['Branch: ' + row.event.branchRef] } : {}),
          healthAssessmentId: row.event.healthAssessmentId,
          branchRef: row.event.branchRef,
          id: row.id,
          readAt: row.readAt,
          createdAt: row.event.createdAt,
          type: row.event.type,
          severity: row.event.severity,
          repository: row.event.repositoryName,
          repositoryId: row.event.repositoryGithubId,
          sourceSha: row.event.sourceSha,
          assessmentId: row.event.assessmentId,
          policyId: row.event.policyId,
          emailDelivery: row.emailDelivery,
        };
      }),
    };
  }
  async preferences(session: AuthenticatedSession) {
    await this.authorization.requireOrganization(session, "assessment.read");
    const preference = await this.db.notificationPreference.findUnique({
      where: {
        identityId_organizationId: {
          identityId: session.identityId,
          organizationId: session.organizationId!,
        },
      },
    });
    return {
      assessments: preference?.assessments ?? true,
      email: preference?.email ?? false,
      emailEnabled: configurationValue("NOTIFICATION_EMAIL_ENABLED") === "true",
      emailAddressAvailable: validNotificationEmail(
        (
          await this.db.identity.findUnique({
            where: { id: session.identityId },
            select: { email: true },
          })
        )?.email,
      ),
    };
  }
  async savePreferences(
    session: AuthenticatedSession,
    assessments: unknown,
    email?: unknown,
  ) {
    if (typeof assessments !== "boolean")
      throw new BadRequestException(
        "Choose whether to receive assessment updates",
      );
    if (email !== undefined && typeof email !== "boolean")
      throw new BadRequestException("Choose whether to receive email");
    await this.authorization.requireOrganization(session, "assessment.read");
    const key = {
      identityId: session.identityId,
      organizationId: session.organizationId!,
    };
    return this.db.$transaction(async (tx) => {
      await tx.notificationPreference.upsert({
        where: { identityId_organizationId: key },
        create: {
          ...key,
          assessments,
          ...(email !== undefined ? { email: email as boolean } : {}),
        },
        update: {
          assessments,
          ...(email !== undefined ? { email: email as boolean } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          event: "notification.preferences.updated",
          actorId: session.identityId,
          metadata: {
            organizationId: session.organizationId!,
            assessments,
            ...(email !== undefined ? { email: email as boolean } : {}),
          },
        },
      });
      return { assessments };
    });
  }
  async read(session: AuthenticatedSession, id?: string) {
    if (!notificationsEnabled())
      throw new NotFoundException("Notifications are disabled");
    if (id && !/^[a-zA-Z0-9-]{1,80}$/.test(id))
      throw new BadRequestException("Invalid notification");
    const result = await this.db.inboxNotification.updateMany({
      where: {
        AND: [
          await this.scope(session),
          { ...(id ? { id } : {}), readAt: null },
        ],
      },
      data: { readAt: new Date() },
    });
    // Idempotent read; never expose whether another user's notification exists.
    return { updated: result.count };
  }
}
